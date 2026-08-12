// LibraryBookController.ts
//
// Owns: one book's grab/carry/lock lifecycle. Uses SIK Interactable +
// InteractableManipulation for pinch-grab-and-move (standard SIK components —
// no hand-rolled hand tracking). Reports release events to LibraryMain, which
// owns cross-cutting shelving state (which shelves/slots are filled, overall
// progress) and decides correct/incorrect placement. This controller only
// executes what Main tells it to (lock / reject / reset) and plays its own
// local, ephemeral visual feedback (scale pulse / shake) — it holds no
// cross-book state itself.
//
// @input colorId must be one of "red" | "green" | "blue" and match the
// sibling LibraryBookMesh's bookColor for the game to read as consistent.

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"

const BOOK_PLACED_SFX = requireAsset("../GeneratedSFX/bookPlaced.wav") as AudioTrackAsset

@component
export class LibraryBookController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LibraryBookController – grab, carry, shelve one book</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint('Book color identity used for shelf-matching gameplay logic ("red" | "green" | "blue"). Must match the sibling LibraryBookMesh bookColor.')
  colorId: string = "red"

  @input
  @hint("Collider/grab box size in centimeters (X,Y,Z). Must match LibraryBookMesh's authored geometry (12 x 2.5 x 17 default).")
  colliderSize: vec3 = new vec3(12, 2.5, 17)
  @ui.group_end

  // Fires on release while unlocked — LibraryMain subscribes and decides
  // correct/incorrect placement, then calls lockToSlot() or rejectPlacement().
  public onReleased: Event<LibraryBookController> = new Event<LibraryBookController>()

  private interactable!: Interactable
  private manipulation!: InteractableManipulation
  private placedAudio!: AudioComponent
  private locked: boolean = false
  private originalPosition!: vec3
  private originalRotation!: quat

  onAwake() {
    this.originalPosition = this.getTransform().getWorldPosition()
    this.originalRotation = this.getTransform().getWorldRotation()

    this.ensureCollider()
    this.ensureInteractable()
    this.ensureManipulation()
    this.ensureAudio()

    // Subscribe inside OnStartEvent — InteractableManipulation wires its own
    // onManipulation* events during its own onAwake; binding here can race that.
    this.createEvent("OnStartEvent").bind(() => {
      this.manipulation.onManipulationEnd.add(() => {
        if (this.locked) return
        this.onReleased.invoke(this)
      })
      // LowLatency — this is immediate feedback tied to a user action, not
      // ambient sound, so it trades power for responsiveness.
      this.placedAudio.playbackMode = Audio.PlaybackMode.LowLatency
    })
  }

  getColorId(): string {
    return this.colorId
  }

  isLocked(): boolean {
    return this.locked
  }

  // Called by LibraryMain when this book is dropped on the matching-color
  // shelf's nearest free slot. Snaps to the slot transform and locks — the
  // book can no longer be grabbed once correctly shelved.
  //
  // The book mesh is authored lying flat (local X=width, Y=thickness "up",
  // Z=length) and the slot's own rotation only carries the shelf's facing
  // yaw, so tipping the book upright — thickness horizontal (row spacing),
  // length vertical — needs an extra local rotation composed on top of the
  // slot's rotation. See STAND_UPRIGHT_ROTATION. FACE_OUT_FLIP then spins
  // the now-standing book 180° about the row axis so its cream page-edge
  // (authored on the local +X face) faces the room instead of the back wall.
  lockToSlot(position: vec3, rotation: quat): void {
    this.locked = true
    this.getTransform().setWorldPosition(position)
    const standing = rotation.multiply(LibraryBookController.STAND_UPRIGHT_ROTATION)
    this.getTransform().setWorldRotation(LibraryBookController.FACE_OUT_FLIP.multiply(standing))
    this.interactable.enabled = false
    this.manipulation.enabled = false
    this.playCorrectFeedback()
  }

  private static readonly STAND_UPRIGHT_ROTATION: quat = quat
    .angleAxis(Math.PI / 2, new vec3(1, 0, 0))
    .multiply(quat.angleAxis(Math.PI / 2, new vec3(0, 0, 1)))

  private static readonly FACE_OUT_FLIP: quat = quat.angleAxis(Math.PI, new vec3(1, 0, 0))

  // Called by LibraryMain when this book is dropped on a mismatched-color
  // shelf (or a full shelf). Stays exactly where released and remains grabbable.
  rejectPlacement(): void {
    this.playIncorrectFeedback()
  }

  // Called by LibraryMain's Reset Library flow.
  resetToOriginal(): void {
    this.locked = false
    this.getTransform().setWorldPosition(this.originalPosition)
    this.getTransform().setWorldRotation(this.originalRotation)
    this.interactable.enabled = true
    this.manipulation.enabled = true
  }

  private ensureCollider(): void {
    let collider = this.sceneObject.getComponent("Physics.ColliderComponent")
    if (!collider) {
      collider = this.sceneObject.createComponent("Physics.ColliderComponent")
      const shape = Shape.createBoxShape()
      shape.size = this.colliderSize
      collider.shape = shape
    }
  }

  private ensureInteractable(): void {
    this.interactable = this.sceneObject.getComponent(Interactable.getTypeName())
    if (!this.interactable) {
      this.interactable = this.sceneObject.createComponent(Interactable.getTypeName())
    }
  }

  private ensureManipulation(): void {
    this.manipulation = this.sceneObject.getComponent(InteractableManipulation.getTypeName())
    if (!this.manipulation) {
      this.manipulation = this.sceneObject.createComponent(InteractableManipulation.getTypeName())
    }
    this.manipulation.enabled = true
  }

  private ensureAudio(): void {
    this.placedAudio = this.sceneObject.getComponent("AudioComponent")
    if (!this.placedAudio) {
      this.placedAudio = this.sceneObject.createComponent("AudioComponent")
    }
    this.placedAudio.audioTrack = BOOK_PLACED_SFX
  }

  private playCorrectFeedback(): void {
    this.placedAudio.play(1)
    const t = this.getTransform()
    const baseScale = t.getLocalScale()
    animate({
      duration: 0.22,
      easing: "ease-out-quad",
      update: (p: number) => {
        const s = 1 + 0.25 * Math.sin(p * Math.PI)
        t.setLocalScale(new vec3(baseScale.x * s, baseScale.y * s, baseScale.z * s))
      },
      ended: () => {
        t.setLocalScale(baseScale)
      },
    })
  }

  private playIncorrectFeedback(): void {
    const t = this.getTransform()
    const basePos = t.getLocalPosition()
    animate({
      duration: 0.3,
      easing: "ease-in-out-quad",
      update: (p: number) => {
        const wiggle = Math.sin(p * Math.PI * 6) * 1.2 * (1 - p)
        t.setLocalPosition(new vec3(basePos.x + wiggle, basePos.y, basePos.z))
      },
      ended: () => {
        t.setLocalPosition(basePos)
      },
    })
  }
}
