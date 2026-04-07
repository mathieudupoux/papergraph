# TODO: Architecture Refactor & Undo/Redo Implementation

## Phase 1: Preparation and Tooling
- [ ] Research and select a lightweight state management library compatible with vanilla JS/ES modules (Zustand is highly recommended).
- [ ] Install the state manager via npm/yarn.
- [ ] Install the associated undo/redo middleware (e.g., `zundo` if using Zustand).

## Phase 2: State Manager Migration
- [ ] Create a new directory and file for the new store (e.g., `js/store/appStore.js`).
- [ ] Map out all properties currently inside `js/core/state.js` and categorize them (e.g., pure data like `appData`, UI flags like `isReadOnlyMode`, and runtime references like `network`).
- [ ] Initialize the new store with the pure data and UI flags. *Note: Avoid putting complex class instances like the Vis.js `network` object directly into the reactive store; keep those as separate references.*
- [ ] Define explicit action functions inside the store for every mutation (e.g., an action to add an article, an action to update a node position, an action to toggle read-only mode).
- [ ] Wrap the store configuration with the undo/redo middleware, configuring it to only track changes to the actual application data (articles, connections, saved positions), ignoring ephemeral UI state like dragging or hover states.

## Phase 3: Decoupling Graph and UI
- [ ] In `js/graph/render.js`, extract the DOM manipulation logic from the `setGraphInteractionMode` function. 
- [ ] Refactor the UI elements (buttons, read-only indicators) to listen to state changes from the new store instead of being directly manipulated by the graph logic.
- [ ] Break down the massive `updateGraph` function in `render.js` into three smaller, distinct helper functions: one for calculating node differences, one for calculating edge differences, and one for managing control points.

## Phase 4: Integrating the Store
- [ ] Go through the codebase and replace all direct mutations of the old `state` object with calls to your new store's action functions.
- [ ] Replace all reads from the old `state` object with reactive subscriptions or get-calls to the new store.
- [ ] Refactor `getGraphData` to pull filtered articles and node positions exclusively from the new store.

## Phase 5: Implementing Undo/Redo
- [ ] Create a new file for keyboard shortcuts (e.g., `js/core/shortcuts.js`).
- [ ] Set up global event listeners for the `keydown` event.
- [ ] Bind `Ctrl+Z` (and `Cmd+Z` for Mac) to the store's temporal `undo` action.
- [ ] Bind `Ctrl+Y` (and `Cmd+Shift+Z` for Mac) to the store's temporal `redo` action.
- [ ] Ensure that triggering an undo/redo automatically calls the graph update functions so the visual canvas reflects the restored state.

## Phase 6: Final Cleanup
- [ ] Systematically search the codebase for `window.state` and remove all instances.
- [ ] Systematically search the codebase for `window.setGraphInteractionMode` and remove all instances.
- [ ] Search for and remove excessive or obsolete `console.log` debugging statements, particularly in `render.js`.
- [ ] Verify that the old `js/core/state.js` file is no longer imported anywhere, and safely delete it.