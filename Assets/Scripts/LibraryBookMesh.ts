// LibraryBookMesh.ts
//
// Owns: procedurally builds one closed-book box mesh (cover box + a lighter
// page-edge stripe along one long side) via MeshBuilder, using a shared
// vertex-color material. Runs once in onAwake; geometry never changes at
// runtime. Collider sizing/placement and grab/placement gameplay live in
// LibraryBookController.ts on the same SceneObject — this script must not
// touch colliders, interaction, or game state.
//
// @input material must be wired to the shared vertexBaseColorMaterial asset
// (package: SimpleVertexBaseColor.lspkg, UUID 70d03593-c7b4-410a-ae5c-75cb82ee32dc).
//
// Book is authored centered on its own origin (geometric center) so a plain
// BoxShape collider needs no offset — see LibraryBookController.

@component
export class LibraryBookMesh extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LibraryBookMesh – procedural book geometry</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Shared vertex-color material (SimpleVertexBaseColor.lspkg / vertexBaseColorMaterial). Wired by the scene bootstrap.")
  material!: Material
  @ui.group_end

  @ui.group_start("Settings")
  @input
  @hint("Cover color for this book instance (RGB, 0-1).")
  @widget(new ColorWidget())
  bookColor: vec3 = new vec3(0.75, 0.15, 0.15)

  @input
  @hint("Page-edge stripe color (cream), visible along one long edge of the cover.")
  @widget(new ColorWidget())
  pageColor: vec3 = new vec3(0.94, 0.9, 0.8)
  @ui.group_end

  // Half-extents of the closed book, in centimeters (full size 12 x 2.5 x 17).
  // Matches the collider set up in LibraryBookController — keep in sync if tuned.
  private static readonly HALF_W = 6.0 // cover width (X)
  private static readonly HALF_H = 1.25 // thickness (Y)
  private static readonly HALF_D = 8.5 // cover length (Z)

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

    const cover: [number, number, number, number] = [this.bookColor.x, this.bookColor.y, this.bookColor.z, 1]
    const pages: [number, number, number, number] = [this.pageColor.x, this.pageColor.y, this.pageColor.z, 1]

    vi = this.addBox(
      builder,
      indices,
      0,
      0,
      0,
      LibraryBookMesh.HALF_W,
      LibraryBookMesh.HALF_H,
      LibraryBookMesh.HALF_D,
      cover,
      vi
    )
    // Page-edge stripe flush against the +X face, protruding 0.6cm outward —
    // outside the main box footprint, so no z-fighting.
    vi = this.addBox(
      builder,
      indices,
      LibraryBookMesh.HALF_W + 0.3,
      0,
      0,
      0.3,
      LibraryBookMesh.HALF_H,
      LibraryBookMesh.HALF_D,
      pages,
      vi
    )

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
