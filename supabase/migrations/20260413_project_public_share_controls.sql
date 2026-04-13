-- Public share controls for read-only project links
-- Run this on an existing Supabase project to manage share enable/disable/regenerate

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS share_token TEXT,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share_token
    ON public.projects (share_token);

CREATE OR REPLACE FUNCTION public.get_project_by_share_token(token TEXT)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    name TEXT,
    data JSONB,
    is_public BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.user_id, p.name, p.data, p.is_public, p.created_at, p.updated_at
    FROM public.projects p
    WHERE p.share_token = token
      AND p.is_public = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_project_share_settings(proj_id UUID)
RETURNS TABLE (
    id UUID,
    is_public BOOLEAN,
    share_token TEXT
) AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = proj_id
          AND p.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Only the project owner can manage sharing';
    END IF;

    RETURN QUERY
    SELECT p.id, p.is_public, p.share_token
    FROM public.projects p
    WHERE p.id = proj_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_project_share_settings(
    proj_id UUID,
    enabled BOOLEAN,
    regenerate BOOLEAN DEFAULT false
)
RETURNS TABLE (
    id UUID,
    is_public BOOLEAN,
    share_token TEXT
) AS $$
DECLARE
    next_token TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = proj_id
          AND p.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Only the project owner can manage sharing';
    END IF;

    SELECT p.share_token
    INTO next_token
    FROM public.projects p
    WHERE p.id = proj_id;

    IF regenerate OR (enabled AND next_token IS NULL) THEN
        next_token := gen_random_uuid()::TEXT;
    END IF;

    UPDATE public.projects p
    SET
        is_public = enabled,
        share_token = COALESCE(next_token, p.share_token),
        updated_at = timezone('utc'::text, now())
    WHERE p.id = proj_id;

    RETURN QUERY
    SELECT p.id, p.is_public, p.share_token
    FROM public.projects p
    WHERE p.id = proj_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_project_by_share_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_share_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_share_settings(UUID, BOOLEAN, BOOLEAN) TO authenticated;
