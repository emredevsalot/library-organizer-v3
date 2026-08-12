// LibraryState.ts
//
// Owns: the single source of truth for shelving progress (X/total correctly
// shelved). Pure logic, no scene access — LibraryMain is the only owner that
// mutates it (incrementShelved()/reset()) and reads it.

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"

export class LibraryState {
  public readonly total: number
  private shelved: number = 0

  public onProgressChanged: Event<{ shelved: number; total: number }> = new Event<{
    shelved: number
    total: number
  }>()
  public onComplete: Event<void> = new Event<void>()

  constructor(total: number) {
    this.total = total
  }

  incrementShelved(): void {
    if (this.shelved >= this.total) return
    this.shelved += 1
    this.onProgressChanged.invoke({ shelved: this.shelved, total: this.total })
    if (this.shelved === this.total) {
      this.onComplete.invoke()
    }
  }

  getShelved(): number {
    return this.shelved
  }

  isComplete(): boolean {
    return this.shelved >= this.total
  }

  reset(): void {
    this.shelved = 0
    this.onProgressChanged.invoke({ shelved: this.shelved, total: this.total })
  }
}
