// LibraryShelfMesh.ts
//
// Owns: procedurally builds one bookshelf frame (2 side panels + back panel +
// shelf slab, all in a fixed wood-brown) plus a color-coded trim band along
// the front-top edge (per-instance trimColor) via MeshBuilder. Runs once in
// onAwake; geometry never changes at runtime.
//
// Shelf-local space, origin at floor center of the footprint (Y=0 = floor).
// Slot anchors (5 authored child SceneObjects, one per book position) are
// created by the scene bootstrap, NOT by this script — see LibraryShelfController.
//
// @input material must be wired to the shared vertexBaseColorMaterial asset
// (package: SimpleVertexBaseColor.lspkg, UUID 70d03593-c7b4-410a-ae5c-75cb82ee32dc).

@component
export class LibraryShelfMesh extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LibraryShelfMesh – procedural bookshelf geometry</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Shared vertex-color material (SimpleVertexBaseColor.lspkg / vertexBaseColorMaterial). Wired by the scene bootstrap.")
  material!: Material
  @ui.group_end

  @ui.group_start("Settings")
  @input
  @hint("Wood-brown frame color, shared across all shelves for a consistent look.")
  @widget(new ColorWidget())
  frameColor: vec3 = new vec3(0.55, 0.38, 0.22)

  @input
  @hint("Color-coded trim band along the front-top edge — set per shelf instance to match its book color.")
  @widget(new ColorWidget())
  trimColor: vec3 = new vec3(0.75, 0.15, 0.15)
  @ui.group_end

  // Shelf footprint (cm), local space, origin at floor center. Keep in sync
  // with the slot-anchor placement authored in the scene bootstrap. Books
  // are shelved standing upright (see LibraryBookController.lockToSlot), so
  // each occupies only its ~2.8cm thickness along the row — width is sized
  // to fit 5 books at 4cm slot spacing (slot centers at X = -8,-4,0,4,8,
  // outer edges ~±9.4) with a ~4.6cm clearance from the inner face of each
  // side panel, instead of the much wider footprint flat books needed.
  private static readonly HALF_WIDTH = 14.0 // X
  private static readonly HALF_DEPTH = 12.5 // Z
  private static readonly FRAME_HEIGHT = 45.0 // Y — top of side panels / shelf surface
  private static readonly PANEL_THICK = 1.5 // side panel half-thickness

  onAwake() {
    const rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual

    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3, normalized: true },
      { name: "color", components: 4 },
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16

    const indices: number[] = []
    let vi = 0

    const frame: [number, number, number, number] = [this.frameColor.x, this.frameColor.y, this.frameColor.z, 1]
    const trim: [number, number, number, number] = [this.trimColor.x, this.trimColor.y, this.trimColor.z, 1]

    const HW = LibraryShelfMesh.HALF_WIDTH
    const HD = LibraryShelfMesh.HALF_DEPTH
    const H = LibraryShelfMesh.FRAME_HEIGHT
    const PT = LibraryShelfMesh.PANEL_THICK
    const midY = H / 2

    // Left side panel
    vi = this.addBox(builder, indices, -(HW - PT), midY, 0, PT, midY, HD, frame, vi)
    // Right side panel
    vi = this.addBox(builder, indices, HW - PT, midY, 0, PT, midY, HD, frame, vi)
    // Back panel (flush with the side panels' back edge, local +Z)
    vi = this.addBox(builder, indices, 0, midY, HD - 1.0, HW - PT, midY, 1.0, frame, vi)
    // Shelf slab — top surface sits exactly at Y = H
    vi = this.addBox(builder, indices, 0, H - 1.0, 0, HW - PT, 1.0, HD, frame, vi)
    // Color-coded trim band along the front-top edge (local -Z = front)
    vi = this.addBox(builder, indices, 0, H + 2.0, -(HD - 1.5), HW - PT, 2.0, 1.5, trim, vi)

    builder.appendIndices(indices)
    rmv.mesh = builder.getMesh()
    if (this.material) rmv.mainMaterial = this.material
    rmv.meshShadowMode = MeshShadowMode.Both
    builder.updateMesh()
  }

  // Verified CCW-from-outside box helper (per mesh-builder-scripting/references/primitives.md).
  private addBox(
    builder: MeshBuilder,
    indices: number[],
    cx: number,
    cy: number,
    cz: number,
    hw: number,
    hh: number,
    hd: number,
    color: [number, number, number, number],
    baseIdx: number
  ): number {
    const x0 = cx - hw,
      x1 = cx + hw
    const y0 = cy - hh,
      y1 = cy + hh
    const z0 = cz - hd,
      z1 = cz + hd

    const verts: number[] = []
    let vi = baseIdx

    const face = (
      p0: [number, number, number],
      p1: [number, number, number],
      p2: [number, number, number],
      p3: [number, number, number],
      n: [number, number, number]
    ) => {
      verts.push(...p0, ...n, ...color, ...p1, ...n, ...color, ...p2, ...n, ...color, ...p3, ...n, ...color)
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
      vi += 4
    }

    face([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]) // +X
    face([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]) // -X
    face([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]) // +Y
    face([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]) // -Y
    face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]) // +Z
    face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]) // -Z

    builder.appendVerticesInterleaved(verts)
    return vi
  }
}
