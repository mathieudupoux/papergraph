Based on your request to overhaul the mouse interactions to align with professional design software like Figma, here is a structured TODO list. This plan modifies `events.js`, `zones.js`, `selection.js`, and `init.js` to shift from right-click panning to a scroll-based system and adds selection-based logic for zone editing.

### 📝 TODO: Figma-like Mouse & Interaction Overhaul

#### 1. Navigation (Scroll-based Panning & Zooming)
* [ ] **Disable Right-Click Panning:** In `setupCanvasEvents`, remove the `event.button === 2` logic that triggers `setIsDraggingView`.
* [ ] **Implement Scroll-to-Pan:**
    * Add a `wheel` event listener to the canvas.
    * Map `event.deltaX` and `event.deltaY` to `getNetwork().moveTo()`.
    * Handle `Shift + Scroll` (vertical scroll becomes horizontal) for standard mouse users.
* [ ] **Implement Ctrl + Wheel Zoom:**
    * Update `wheel` listener to check for `event.ctrlKey` (or `metaKey`).
    * Use `getNetwork().getScale()` and `getNetwork().moveTo()` to zoom toward the mouse cursor position.
* [ ] **Touchpad Pinch-to-Zoom:** Ensure the `wheel` event handles `event.ctrlKey` which is triggered by touchpad pinch gestures on most modern browsers.

#### 2. Visual Selection & Outlining
* [ ] **Pre-selection Outline:** * In the `hoverNode` and `hoverEdge` event handlers in `setupNetworkEvents`, update the object's `shadow` or `borderWidth` to show an "outline" before the user clicks.
* [ ] **Click-to-Select Logic:**
    * Modify `mousedown` to distinguish between a simple selection click and a "drag-to-select" action.
    * Update `vis.Network` options in `init.js` to ensure `chosen` properties provide a clear, persistent outline (e.g., a blue 2px border) for the currently selected object.

#### 3. Refined Tag Zone Interactions
* [ ] **Selection-based Resizing:**
    * Modify `getZoneResizeHandle` in `zones.js` to return `null` if the zone is not currently selected (`zoneIndex !== getStore().selectedZoneIndex`).
    * Update `drawTagZones` to only draw the resize corner handles (visual cues) when `originalIndex === getStore().selectedZoneIndex`.
* [ ] **Restricted Movement:**
    * In `mousedown` (within `events.js`), only allow the zone to move if the click is on the **Zone Title** or if the zone is already **Selected**.
    * If a user clicks inside an unselected zone (not on the title), it should select the zone first but not move it until the next drag.

#### 4. Right-Click Context Menu (Popup List)
* [ ] **Replace Default Context Menu:**
    * In the `contextmenu` listener in `events.js`, instead of just calling `preventDefault()`, trigger a new `showContextMenu(x, y)` function.
* [ ] **Create UI Component:**
    * Build a vertical list menu (HTML/CSS) for "Quick Access Commands" (e.g., Copy, Paste, Delete, Bring to Front, Group).
    * Ensure the menu closes when clicking outside or pressing `Esc`.

#### 5. Clean up & Physics
* [ ] **Disable Interaction Conflicts:** In `init.js`, ensure `interaction.dragView` is set to `false` since we are moving to manual scroll-based panning.

---
**Established user intent:** The user wants to modify the mouse and keyboard interaction patterns of the Papergraph editor to mimic design tools like Figma, specifically changing how panning, zooming, selecting, and zone editing work.

**Relevant files:** - `/js/graph/events.js` (Canvas/Mouse events)
- `/js/graph/zones.js` (Zone interaction logic)
- `/js/graph/init.js` (Network options)
- `/js/graph/selection.js` (Selection box logic)