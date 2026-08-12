// LibraryOrganizerUI.ts
//
// Owns: the visible-at-start "Time to Organize!" intro dialog (dismissed by
// its own CTA button, purely a local UI concern — no cross-module wiring),
// the always-visible "Books Shelved" progress HUD (which also carries a
// live-updating organize timer), and the hidden-until-complete completion
// dialog with its final elapsed time and Reset Library button. The intro
// and completion copy both frame this mini-game as a quick warm-up for the
// player's real-life organizing, per the experience's premise.
//
// The timer itself is owned here (not LibraryState/Main) since it is purely
// a presentational session clock, not shelving-correctness game state.
// startTimer() is called both locally (the intro's own CTA button) and by
// Main (on Reset Library); stopTimer() is called by Main when the game
// completes, alongside showComplete().
//
// Passive view only — holds no shelving-decision state.
// Main -> UI: setProgress(shelved, total), startTimer(), stopTimer(),
//             showComplete(), hideComplete().
// UI -> Main: onResetRequested (fires when the Reset Library button is pressed).
//
// Root SceneObject is meant to be parented under the Camera by the bootstrap
// so both panels stay in view as a camera-relative HUD while the user walks
// around the room organizing books.
//
// The progress HUD (buildProgressPanel) disables depth test/write on its
// backing and content so it always renders as a true on-top overlay instead
// of being real, depth-occluding world geometry — otherwise a book/shelf
// farther than its fixed ~110cm distance gets fully hidden behind it
// wherever it crosses on screen. This only works if Camera Object is the
// LAST root-level SceneObject in Scene Hierarchy order (paints after all
// world content) — see AGENTS.md "Rendering Order". If Camera Object is
// ever moved earlier in the root hierarchy, this HUD will start losing to
// world content again.

import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import { FlexAlign, FlexDirection, FlexJustify } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material
const ICON_MENU_BOOK: Texture = requireAsset("../Icons/menu_book.png") as Texture
const ICON_CELEBRATION: Texture = requireAsset("../Icons/celebration.png") as Texture
const ICON_HOME: Texture = requireAsset("../Icons/home.png") as Texture
const ICON_TIMER: Texture = requireAsset("../Icons/timer.png") as Texture

// M:SS, no leading zero on minutes, always 2 digits on seconds.
function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? "0" : ""}${s}`
}

function formatCompletedIn(seconds: number): string {
  return `You've completed in ${formatElapsed(seconds)}`
}

const LAYOUT_Z_LIFT = 0.02
const BUTTON_LABEL_Z = 0.08

// ── Typography: single source of truth for text size + weight ─────────────
const FONT_SIZE_SCALE = 1.0
type TextRole =
  | "Title1" | "Title2" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Button" | "Callout" | "Body" | "Caption"

const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title1: { size: 105, weight: 700 },
  Title2: { size: 120, weight: 700 },
  HeadlineXL: { size: 62, weight: 700 },
  Headline1: { size: 98, weight: 700 },
  Headline2: { size: 48, weight: 700 },
  Subheadline: { size: 41, weight: 700 },
  Button: { size: 39, weight: 500 },
  Callout: { size: 58, weight: 700 },
  Body: { size: 55, weight: 500 },
  Caption: { size: 66, weight: 500 },
}

function roleSize(role: TextRole, distanceCm: number = 110): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
}

function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110): void {
  t.size = roleSize(role, distanceCm)
  ;(t as Text & { weight?: number }).weight = TYPE_SCALE[role].weight
}

/**
 * <span style="color: #60A5FA;">LibraryOrganizerUI – progress HUD + completion dialog</span>
 */
@component
export class LibraryOrganizerUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LibraryOrganizerUI – progress HUD + completion dialog</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Warm wood-brown accent color used for the counter number and dialog title.")
  @widget(new ColorWidget())
  accentColor: vec4 = new vec4(0.85, 0.62, 0.32, 1)

  @input
  @hint("Body/label text color (progress label, dialog body).")
  @widget(new ColorWidget())
  textColor: vec4 = new vec4(1, 1, 1, 0.85)

  @input
  @hint("Progress HUD panel width, in centimeters.")
  @widget(new SliderWidget(10, 26, 0.5))
  progressPanelWidth: number = 18

  @input
  @hint("Progress HUD panel height, in centimeters.")
  @widget(new SliderWidget(4, 14, 0.5))
  progressPanelHeight: number = 10.5

  @input
  @hint("Complete dialog width, in centimeters.")
  @widget(new SliderWidget(16, 40, 0.5))
  dialogWidth: number = 26

  @input
  @hint("Complete dialog height, in centimeters.")
  @widget(new SliderWidget(10, 30, 0.5))
  dialogHeight: number = 18

  @input
  @hint("Label shown above the progress counter.")
  progressLabel: string = "Books Shelved"

  @input
  @hint("Intro dialog title, shown once at Lens start before the player begins.")
  introTitle: string = "Time to Organize!"

  @input
  @hint("Intro dialog body text — frames the mini-game as a warm-up for the player's real-life organizing.")
  introBody: string = "Sort the books by color to warm up your organizing skills. When you're done, bring that same focus to your real space."

  @input
  @hint("Label on the intro dialog's CTA button that dismisses it and starts play.")
  introButtonLabel: string = "Let's Go"

  @input
  @hint("Dialog title shown when all books are shelved correctly.")
  completeTitle: string = "Nice Work!"

  @input
  @hint("Dialog body text shown under the title — ties the completed mini-game back to the player's real-life organizing.")
  completeBody: string = "You just organized 15 books. Now go bring that same energy to your real bookshelf, desk, or closet."

  @input
  @hint("Label on the reset/replay button.")
  resetButtonLabel: string = "Reset Library"
  @ui.group_end

  private progressCounterText!: Text
  private liveTimerText!: Text
  private completeTimeText!: Text
  private dialogRoot!: SceneObject
  private _onResetRequested: Event<void> = new Event<void>()

  private timerRunning: boolean = false
  private timerStartTime: number = 0

  get onResetRequested(): PublicApi<void> {
    return this._onResetRequested.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
    this.buildProgressPanel()
    this.buildCompleteDialog()
    // Built last so it paints on top (Canvas sorts by hierarchy order) and
    // is the first thing the player sees.
    this.buildIntroDialog()

    this.createEvent("UpdateEvent").bind(() => {
      if (!this.timerRunning || !this.liveTimerText) return
      this.liveTimerText.text = formatElapsed(getTime() - this.timerStartTime)
    })
  }

  setProgress(shelved: number, total: number): void {
    if (!this.progressCounterText) return
    this.progressCounterText.text = `${shelved}/${total}`
  }

  // Called both by the intro dialog's own CTA button (first play) and by
  // Main.resetGame() (replay) — always (re)starts from zero regardless of
  // any prior run.
  startTimer(): void {
    this.timerStartTime = getTime()
    this.timerRunning = true
    if (this.liveTimerText) this.liveTimerText.text = formatElapsed(0)
  }

  // No-ops if the timer was never started (e.g. all books somehow shelved
  // without the intro ever being dismissed) so completion doesn't show a
  // nonsense elapsed time.
  stopTimer(): void {
    if (!this.timerRunning) return
    const elapsed = getTime() - this.timerStartTime
    this.timerRunning = false
    if (this.liveTimerText) this.liveTimerText.text = formatElapsed(elapsed)
    if (this.completeTimeText) this.completeTimeText.text = formatCompletedIn(elapsed)
  }

  showComplete(): void {
    if (this.dialogRoot) this.dialogRoot.enabled = true
  }

  hideComplete(): void {
    if (this.dialogRoot) this.dialogRoot.enabled = false
  }

  // ───────────────────────── Progress HUD (BackPlate) ─────────────────────────

  private buildProgressPanel(): void {
    // z = -110 cm is Specs' full-binocular-overlap focal distance (53x77 cm
    // usable area) — the panel was previously at z=-60, which shrinks the
    // usable safe area proportionally and clipped the top of this panel
    // (icon + counter row) out of the visible frustum, leaving only the
    // bottom label line on screen.
    const root = this.obj(this.sceneObject, "ProgressPanel", new vec3(0, 25, -110))
    const backPlate = root.createComponent(BackPlate.getTypeName()) as BackPlate
    backPlate.size = new vec2(this.progressPanelWidth, this.progressPanelHeight)

    // This is a persistent, camera-locked HUD, not a world-anchored panel —
    // it must never depend on real depth vs. the room. With normal depth
    // test/write, whichever of the panel (fixed ~110cm) and world content
    // (books/shelves, often several meters out) is physically nearer wins
    // per pixel, so any book/shelf farther than the panel gets fully hidden
    // behind it wherever it crosses on screen, reading as the object
    // vanishing. Disabling depth test/write on the backing and its content
    // (paired with the scene bootstrap placing Camera Object last in the
    // root hierarchy so this paints after all world content) makes it a
    // true always-on-top overlay with a fixed, predictable footprint
    // instead of unpredictably swallowing distant objects.
    backPlate.onInitialized.add(() => {
      const rmv = root.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (rmv && rmv.mainPass) {
        rmv.mainPass.depthTest = false
        rmv.mainPass.depthWrite = false
      }
    })

    const content = this.obj(root, "Content", new vec3(0, 0, 0.6))
    const col = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    col.width = this.progressPanelWidth
    col.height = this.progressPanelHeight
    col.direction = FlexDirection.Column
    col.alignItems = FlexAlign.Center
    col.justifyContent = FlexJustify.Center
    col.rowGap = 0.4
    col.paddingTop = 0.6
    col.paddingBottom = 0.6
    col.paddingLeft = 1.2
    col.paddingRight = 1.2

    const rowW = this.progressPanelWidth - 2.4

    this.flexChild(content, { w: rowW, h: 1.2 }, (labelObj) => {
      this.addRowText(labelObj, this.progressLabel, "Caption", rowW, this.textColor, HorizontalAlignment.Center, false)
    })

    this.flexChild(content, { w: rowW, h: 4.2 }, (row1) => {
      const rowFlex = this.flexRow(row1, rowW, 4.2, { gap: 0.1, justify: FlexJustify.Center, align: FlexAlign.Center })
      this.flexChild(rowFlex, { w: 4.4, h: 4.2 }, (iconObj) => this.addImage(iconObj, ICON_MENU_BOOK, 3.9, false))
      this.flexChild(rowFlex, { w: 7, h: 4.2 }, (counterObj) => {
        this.progressCounterText = this.addRowText(
          counterObj,
          "0/15",
          "Headline1",
          4,
          this.accentColor,
          HorizontalAlignment.Left,
          false
        )
      })
    })



    this.flexChild(content, { w: rowW, h: 2.6 }, (row2) => {
      const rowFlex = this.flexRow(row2, rowW, 2.6, { gap: 0, justify: FlexJustify.Center, align: FlexAlign.Center })
      //this.flexChild(rowFlex, { w: 3.0, h: 2.6 }, (iconObj) => this.addImage(iconObj, ICON_TIMER, 2.6))
      this.flexChild(rowFlex, { w: 6, h: 2.6 }, (timeObj) => {
        this.liveTimerText = this.addRowText(
          timeObj,
          formatElapsed(0),
          "Callout",
          0,
          this.textColor,
          HorizontalAlignment.Center,
          false
        )
      })
    })
  }

  // ───────────────────────── Intro Dialog (Frame, starts visible) ─────────────

  private buildIntroDialog(): void {
    // Same focal-distance placement as the progress panel / complete dialog
    // — see buildProgressPanel. Starts visible (Frame's default) since this
    // is the very first thing the player should see; dismissing it is a
    // purely local UI action (no game state involved), so the CTA button
    // just disables this root directly instead of routing through Main.
    const root = this.obj(this.sceneObject, "IntroDialog", new vec3(0, 0, -110))

    const frame = root.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.autoScaleContent = false
    frame.allowScaling = false

    frame.onInitialized.add(() => {
      frame.innerSize = new vec2(this.dialogWidth, this.dialogHeight)

      const content = this.obj(frame.contentTransform.getSceneObject(), "Content", new vec3(0, 0, 0.6))
      const col = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
      col.width = this.dialogWidth
      col.height = this.dialogHeight
      col.direction = FlexDirection.Column
      col.alignItems = FlexAlign.Center
      col.justifyContent = FlexJustify.Center
      col.rowGap = 1.0
      col.paddingTop = 1.5
      col.paddingBottom = 1.5
      col.paddingLeft = 1.5
      col.paddingRight = 1.5

      const innerW = this.dialogWidth - 3

      this.flexChild(content, { w: 5, h: 5 }, (iconObj) => this.addImage(iconObj, ICON_HOME, 4.6))

      this.flexChild(content, { w: innerW, h: 3.2 }, (titleObj) => {
        this.addRowText(titleObj, this.introTitle, "Title2", innerW, this.accentColor)
      })

      this.flexChild(content, { w: innerW, h: 4.5 }, (bodyObj) => {
        const t = this.addRowText(bodyObj, this.introBody, "Body", innerW, this.textColor)
        t.horizontalOverflow = HorizontalOverflow.Wrap
      })

      this.flexChild(content, { w: 16, h: 3.2 }, (btnObj) => {
        this.addButton(btnObj, this.introButtonLabel, 16, 3.0, () => {
          root.enabled = false
          this.startTimer()
        })
      })
    })
  }

  // ───────────────────────── Complete Dialog (Frame, starts hidden) ───────────

  private buildCompleteDialog(): void {
    // Same focal-distance fix as the progress panel — see buildProgressPanel.
    const root = this.obj(this.sceneObject, "CompleteDialog", new vec3(0, 0, -110))
    this.dialogRoot = root

    const frame = root.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.autoScaleContent = false
    frame.allowScaling = false

    frame.onInitialized.add(() => {
      frame.innerSize = new vec2(this.dialogWidth, this.dialogHeight)

      const content = this.obj(frame.contentTransform.getSceneObject(), "Content", new vec3(0, 0, 0.6))
      const col = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
      col.width = this.dialogWidth
      col.height = this.dialogHeight
      col.direction = FlexDirection.Column
      col.alignItems = FlexAlign.Center
      col.justifyContent = FlexJustify.Center
      col.rowGap = 1.0
      col.paddingTop = 1.5
      col.paddingBottom = 1.5
      col.paddingLeft = 1.5
      col.paddingRight = 1.5

      const innerW = this.dialogWidth - 3

      this.flexChild(content, { w: 5, h: 5 }, (iconObj) => this.addImage(iconObj, ICON_CELEBRATION, 4.6))

      this.flexChild(content, { w: innerW, h: 3.2 }, (titleObj) => {
        this.addRowText(titleObj, this.completeTitle, "Title2", innerW, this.accentColor)
      })

      this.flexChild(content, { w: innerW, h: 4.5 }, (bodyObj) => {
        const t = this.addRowText(bodyObj, this.completeBody, "Body", innerW, this.textColor)
        t.horizontalOverflow = HorizontalOverflow.Wrap
      })

      this.flexChild(content, { w: innerW, h: 3.0 }, (timeObj) => {
        this.completeTimeText = this.addRowText(timeObj, formatCompletedIn(0), "Callout", innerW, this.accentColor)
      })

      this.flexChild(content, { w: 16, h: 3.2 }, (btnObj) => {
        this.addButton(btnObj, this.resetButtonLabel, 16, 3.0, () => {
          this._onResetRequested.invoke()
        })
      })

      // Start hidden — MUST be the last statement inside onInitialized (see
      // specs-build-ui gotchas G3): a synchronous disable in onAwake would
      // prevent OnStartEvent from ever firing on this SceneObject, which
      // means Frame.initialize() never runs and onInitialized never fires.
      this.dialogRoot.enabled = false
    })
  }

  // ───────────────────────── Layout composition helpers ───────────────────────

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const sceneObject = global.scene.createSceneObject(name)
    sceneObject.setParent(parent)
    if (position) sceneObject.getTransform().setLocalPosition(position)
    return sceneObject
  }

  private liftInZ(sceneObject: SceneObject, zOffset: number): void {
    const transform = sceneObject.getTransform()
    const pos = transform.getLocalPosition()
    transform.setLocalPosition(new vec3(pos.x, pos.y, pos.z + zOffset))
  }

  private flexRow(
    parent: SceneObject,
    width: number,
    height: number,
    opts?: { gap?: number; padY?: number; padX?: number; justify?: FlexJustify; align?: FlexAlign }
  ): SceneObject {
    return this.makeFlex(parent, FlexDirection.Row, width, height, opts)
  }

  private makeFlex(
    parent: SceneObject,
    direction: FlexDirection,
    width: number,
    height: number,
    opts?: { gap?: number; padY?: number; padX?: number; justify?: FlexJustify; align?: FlexAlign }
  ): SceneObject {
    const container = this.obj(parent, "Flex")
    this.liftInZ(container, LAYOUT_Z_LIFT)
    const flexLayout = container.createComponent(FlexLayout.getTypeName()) as FlexLayout
    const flexItem = container.createComponent(FlexItem.getTypeName()) as FlexItem
    if (width > 0) flexItem.overrideWidth = width
    if (height > 0) flexItem.overrideHeight = height

    flexLayout.width = width
    flexLayout.height = height
    flexLayout.direction = direction
    if (direction === FlexDirection.Row) {
      flexLayout.columnGap = opts?.gap ?? 0
    } else {
      flexLayout.rowGap = opts?.gap ?? 0
    }
    flexLayout.paddingTop = opts?.padY ?? 0
    flexLayout.paddingBottom = opts?.padY ?? 0
    flexLayout.paddingLeft = opts?.padX ?? 0
    flexLayout.paddingRight = opts?.padX ?? 0
    flexLayout.justifyContent = opts?.justify ?? FlexJustify.Start
    flexLayout.alignItems = opts?.align ?? FlexAlign.Stretch
    return container
  }

  private flexChild(
    parent: SceneObject,
    size: { w?: number; h?: number; grow?: number },
    builder: (childObject: SceneObject) => void
  ): SceneObject {
    const child = this.obj(parent, "Item")
    this.liftInZ(child, LAYOUT_Z_LIFT)
    const flexItem = child.createComponent(FlexItem.getTypeName()) as FlexItem
    if (size.w !== undefined && size.w > 0) flexItem.overrideWidth = size.w
    if (size.h !== undefined && size.h > 0) flexItem.overrideHeight = size.h
    flexItem.flexGrow = size.grow ?? 0
    flexItem.flexShrink = 0

    builder(child)

    // Do not call FlexLayout.addItems here: with autoDiscoverItemsOnStart
    // (the default), the parent layout scans its child FlexItems itself on
    // OnStartEvent — calling addItems before that fires throws, since all of
    // this UI is built synchronously in onAwake.
    return child
  }

  private addRowText(
    parent: SceneObject,
    text: string,
    role: TextRole,
    widthCM: number,
    color: vec4,
    align: HorizontalAlignment = HorizontalAlignment.Center,
    depthTest: boolean = true
  ): Text {
    const so = global.scene.createSceneObject("RowText")
    so.setParent(parent)
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = depthTest
    applyTextRole(t, role)
    t.textFill.color = color
    t.horizontalAlignment = align
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -1.2, 1.2)
    so.createComponent(FlexItem.getTypeName())
    return t
  }

  private addButtonLabel(parent: SceneObject, text: string, widthCM: number, role: TextRole = "Button"): void {
    const so = global.scene.createSceneObject("ButtonLabel")
    so.setParent(parent)
    so.getTransform().setLocalPosition(new vec3(0, 0, BUTTON_LABEL_Z))
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role)
    t.textFill.color = new vec4(1, 1, 1, 1)
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -1.2, 1.2)
    so.createComponent(FlexItem.getTypeName())
  }

  private addButton(parent: SceneObject, text: string, sizeXCM: number, sizeYCM: number, onClick: () => void): void {
    const so = global.scene.createSceneObject(text)
    so.setParent(parent)
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.size = new vec3(sizeXCM, sizeYCM, 1)
    this.addButtonLabel(so, text, sizeXCM - 0.5)
    so.createComponent(FlexItem.getTypeName())
    btn.onTriggerUp.add(onClick)
  }

  private addImage(parent: SceneObject, texture: Texture, sizeCM: number, depthTest: boolean = true): void {
    const so = global.scene.createSceneObject("Image")
    so.setParent(parent)
    const img = so.createComponent("Component.Image") as Image

    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = texture
    mat.mainPass.depthTest = depthTest
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)

    so.getTransform().setLocalScale(new vec3(sizeCM, sizeCM, 1))
    so.createComponent(FlexItem.getTypeName())
  }
}
