# AI-Assisted Development Log — Library Organizer (SPECS Lens)

**Project:** SpecsTest_R1 — Lens Studio / Spectacles AR experience
**Tool:** Claude Code with the Lens Studio agent toolkit (CLAD)
**Format:** Each entry is the user's prompt, verbatim, followed by a summary of the AI-assisted workflow carried out in response.

---

## 1. Initial build

> Can you please build me a SPECS lens containing a small library? Here's what I want: I want 5 red, 5 green, 5 blue books scattered on the floor. I want 3 bookshelves in those colors. I want it as a mini game where user can pick up the correct colored book, and put on the correct shelf to organize the shelves.

Delegated to the `specs-experience-builder` agent, which planned and built the experience end to end:
- Procedurally authored book and bookshelf meshes via `MeshBuilder` (no external 3D tooling available on this machine).
- Wrote modular TypeScript: `LibraryBookMesh`, `LibraryShelfMesh`, `LibraryBookController` (grab/lock lifecycle via Spectacles Interaction Kit), `LibraryShelfController` (slot occupancy), `LibraryState` (progress tracking), `LibraryMain` (orchestration), `LibraryOrganizerUI` (HUD/UI).
- Bootstrapped the scene via `VirtualScene`: 15 scattered books (5 per color), 3 color-coded shelves with 5 slot anchors each.
- Verified compile and runtime logs, then found and fixed two bugs surfaced during my own follow-up testing: a `FlexLayout.addItems()` race condition, and a book-event subscription ordering bug tied to Scene Hierarchy execution order.

## 2. UI not rendering

> I don't see any UI elements, just a text saying 'Books Shelved' at the top. Can you take a look at the UI overall and fix it?

Diagnosed via live preview screenshots and camera framing tests: the HUD panel was positioned at `z = -60cm`, well inside Specs' recommended `z = -110cm` focal distance — this shrank the usable safe field-of-view and clipped the top of the panel (icon + counter row) out of frame, leaving only the bottom label visible. Moved the HUD and dialog root to `z = -110cm` and re-verified visually.

## 3. Completion dialog never appears

> After I complete it with 15 books, I just see the 15/15 Books Shelved, no completion dialog or restart button

Root-caused via targeted debug logging and a live 15-book test run: `LibraryMain` was disabling the completion dialog's `SceneObject` at startup *before* the dialog's own `OnStartEvent` had a chance to run its one-time `Frame` initialization. In Lens Studio, a disabled object's `OnStartEvent` is deferred until next enabled — so the dialog's content never initialized until the moment it was shown at game completion, whose own "start hidden" step then instantly re-hid it. Removed the redundant early-hide call; verified the fix with a full 15-book playthrough.

## 4. Books should stand upright

> Right now the books are laid on the table, I want them to stack like in a bookshelf, not laying but standing up

Derived and implemented a compound rotation for shelved books (verified empirically against live preview screenshots and world-rotation queries, since the object-relative auto-framing tool was misleading for this check). Also raised the shelf slot anchors to the correct height for a standing book's footprint and tightened slot spacing to match, then shrank shelf width to remove the excess gap this created.

## 5. Mirror books; shorten shelves

> I want the books mirrored(I want the user to be able to see the white part when they place the book), and we can shorten the shelves a little bit, since there are so much empty spaces on each shelf when we place all 5 books

Added a 180° flip to the shelving rotation so the book's cream page-edge faces outward instead of the plain spine color. Reduced each shelf's width (`HALF_WIDTH`) from 41cm to 14cm to fit the now-compact row of standing books with a small margin instead of a wide empty shelf.

## 6. Bring shelves closer together

> this is good. Couple of notes: The shelves are too far away from eachother, let's bring them closer.

Reduced shelf spacing from ±150cm to ±55cm, and reduced each shelf's book-drop detection radius from 55cm to 22cm to match — otherwise the closer shelves' detection zones would overlap and misattribute which shelf a dropped book was near.

## 7. Snapshot the project as R1 / R2

> Now I want to keep this version of the project as R1, and try some more changes in a R2 folder. How can I do that?

Copied the project directory to a sibling `SpecsTest_R2` folder, excluding files tied to the live Lens Studio session (project lock file, MCP connection configs) since those are auto-regenerated per environment. Explained that R2 would need its own Lens Studio window and its own coding-assistant session to be actively developed.

## 8. Exact steps for connecting to R2

> can you guide me on step 3, with exact steps

Provided the precise sequence: open `SpecsTest_R2.esproj` in Lens Studio, confirm its own MCP connection files get generated, then start a *new* terminal/Claude Code session with working directory `SpecsTest_R2` (since an existing session's MCP wiring is fixed at startup and can't be redirected mid-conversation).

## 9. Continue working in R1 instead

> Since you are already familiar with the project in this session, I want to make changes in R1, and keep R2 as a backup.

No file changes needed — this session's Lens Studio connection was already bound to R1, so continuing here naturally kept R2 untouched as a frozen snapshot.

## 10. Organizing-themed intro/completion UI

> Now I want to change some UI related stuff. This lens will be about organizing your surroundings. I want it to be a quick spatial organizing experience for the user, to get them ready and going for their real life organization stuff. Can you add some sort of UI/CTA stuff related to that, at the start and after finishing?

Added a new intro dialog shown at Lens start ("Time to Organize!" + framing copy + a "Let's Go" CTA button that dismisses it) and rewrote the completion dialog's copy ("Nice Work! ... bring that same energy to your real bookshelf, desk, or closet") to tie the mini-game back to the player's real-life organizing, per the experience's premise. Sourced new icons (home, timer) via the Lens Studio icon library.

## 11. Add an organize timer

> let's add a timer as well. When user starts organizing, it should start, when user is done, it should stop and inform the user how long it took for them to organize the books

Added a live-updating session timer to the progress HUD (`M:SS`), started when the intro's CTA button is pressed or the game is reset, and stopped the moment all 15 books are correctly shelved — with the final time also surfaced on the completion dialog.

## 12. Simplify the completion time display

> let's not add the icon and the final time in the final card, instead let's just say 'you've completed in xx:xx'

Replaced the icon + time row on the completion dialog with a single text line reading "You've completed in *M:SS*".

## 13. This log

> can I get a prompt log since we started? my project asks for this: 'Include a text file, transcript, or document showing the prompts and AI-assisted workflow used to help create your project with CLAD.'

Generated this document.

---

*Every change above was verified in Lens Studio's live preview before being reported as complete — via simulated pinch/drag interactions, runtime log checks for script errors, and visual screenshot comparisons — rather than relying on compile success alone.*
