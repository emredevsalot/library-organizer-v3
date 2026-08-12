// LibraryShelfController.ts
//
// Owns: this shelf's color identity and its 5 slot anchors' occupancy state
// (which slots are filled — shelf-local concern, not global game state).
// Slot anchor SceneObjects themselves are authored by the scene bootstrap
// (Hard Rule 5 — human-placeable target positions), not built here. LibraryMain
// queries isNearShelf()/getColorId() to decide which shelf a released book is
// over, then calls claimNearestFreeSlot() to reserve + get the snap transform.
//
// @input slotAnchors must be wired to exactly 5 child SceneObjects positioned
// along the shelf's top surface (wired by the scene bootstrap Phase B).

@component
export class LibraryShelfController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LibraryShelfController – shelf color + slot occupancy</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The 5 slot anchor SceneObjects (child empties) a correctly-shelved book snaps to, in order.")
  slotAnchors: SceneObject[] = []
  @ui.group_end

  @ui.group_start("Settings")
  @input
  @hint('This shelf\'s color identity ("red" | "green" | "blue"). Must match the sibling LibraryShelfMesh trimColor.')
  colorId: string = "red"

  @input
  @hint("Horizontal (XZ) distance in centimeters within which a released book counts as 'dropped near this shelf'.")
  @widget(new SliderWidget(20, 100, 5))
  dropDetectionRadius: number = 55
  @ui.group_end

  private occupied: boolean[] = []

  onAwake() {
    this.occupied = this.slotAnchors.map(() => false)
  }

  getColorId(): string {
    return this.colorId
  }

  // Horizontal-only distance check — ignores Y so a book released at any
  // reasonable hand height near this shelf's footprint still registers.
  isNearShelf(worldPos: vec3): boolean {
    const shelfPos = this.getTransform().getWorldPosition()
    const dx = worldPos.x - shelfPos.x
    const dz = worldPos.z - shelfPos.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    return dist <= this.dropDetectionRadius
  }

  // Finds the nearest unoccupied slot to worldPos and reserves it atomically.
  // Returns null if every slot is already filled (shouldn't normally happen —
  // exactly 5 correct-color books ever exist per shelf — but guarded).
  claimNearestFreeSlot(worldPos: vec3): SceneObject | null {
    let bestIndex = -1
    let bestDist = Number.MAX_VALUE
    for (let i = 0; i < this.slotAnchors.length; i++) {
      if (this.occupied[i]) continue
      const slotPos = this.slotAnchors[i].getTransform().getWorldPosition()
      const dx = worldPos.x - slotPos.x
      const dz = worldPos.z - slotPos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = i
      }
    }
    if (bestIndex === -1) return null
    this.occupied[bestIndex] = true
    return this.slotAnchors[bestIndex]
  }

  resetSlots(): void {
    this.occupied = this.slotAnchors.map(() => false)
  }
}
