import { advanceVisual, describeEvent, eventDelay, expandPresentation } from './presentation.mjs';

// Rules resolve transactionally, but only the current beat's snapshot reaches UI.
// Synthetic draw/focus beats never consume RNG or enter the raw semantic log.
export class ResolutionQueue {
  constructor({ state, dispatch, onChange, saved }) {
    this.dispatch = dispatch;
    this.onChange = onChange;
    this.state = saved?.state ?? state;
    this.view = saved?.view ?? this.state;
    this.pending = saved?.pending ?? [];
    if (saved && !saved.presentationVersion) this.pending = expandPresentation(this.pending, this.view, saved.current);
    this.log = saved?.log ?? [];
    this.current = saved?.current ?? null;
    this.speed = saved?.speed === 'step' ? 'manual' : saved?.speed ?? (this.state.config.animationMs === 0 ? 'instant' : this.state.config.presentationSpeed ?? 'normal');
    this.presenting = saved?.presenting ?? this.pending.length > 0;
    this.paused = this.presenting; // Restored events always await deliberate continuation.
    this.visual = saved?.visual ?? this.log.reduce((visual, event) => advanceVisual(visual, event), {});
    this.beat = saved?.beat ?? this.current?.beat ?? 0;
    this.timer = null;
  }
  get busy() { return this.presenting || this.pending.length > 0; }
  export() {
    return { version: 1, presentationVersion: 2, state: this.state, view: this.view, pending: this.pending,
      log: this.log, current: this.current, speed: this.speed, visual: this.visual, beat: this.beat, presenting: this.presenting };
  }
  changed() { this.onChange?.(this); }
  send(command) {
    if (this.busy) throw new Error('Let the current event sequence finish first.');
    const result = this.dispatch(this.state, command);
    this.pending = expandPresentation(result.events, this.view);
    this.state = result.state;
    if (!this.pending.length) this.view = this.state;
    this.presenting = this.pending.length > 0;
    this.next();
  }
  consume(event, visible) {
    const { state, ...entry } = event;
    this.view = state ?? this.view;
    // Snapshot metadata becomes small, explicit presentation fields before the
    // snapshot is removed from the recorder/current beat. Titles and timing on
    // resumed queues therefore use the same clocks as the original event.
    if (this.view.ruleset === 'v2-continuous') {
      const fighter = this.view.fighters?.find(fighter => fighter.id === event.fighterId);
      if (event.type === 'ENGAGEMENT_SPENT' || event.type === 'FIGHTER_BREAKING_OFF') {
        entry.enemyType ??= fighter?.type;
        entry.engagementRemaining ??= fighter?.engagementRemaining;
      }
      if (event.type === 'WORK_TIME_ADVANCED') {
        const job = this.view.jobs?.find(job => job.id === event.jobId);
        entry.kind ??= job?.kind;
        entry.remainingTime ??= job?.remainingTime;
      }
    }
    const clock = this.view.ruleset === 'v2-continuous'
      ? { ruleset: this.view.ruleset, crewCycle: this.view.crewCycle.number, cycleTurn: this.view.crewCycle.turn }
      : { round: this.view.round };
    const logged = { ...entry, ...clock, sequence: this.log.length + 1 };
    if (!event.presentationOnly) this.log.push(logged);
    this.visual = advanceVisual(this.visual, event, this.view);
    if (visible) this.current = { ...logged, beat: ++this.beat };
  }
  next() {
    clearTimeout(this.timer);
    this.timer = null;
    while (this.pending.length) {
      const event = this.pending.shift();
      const major = describeEvent(event).major;
      this.consume(event, major);
      if (!major) continue; // Preserve bookkeeping in the log without flashing the banner.
      this.presenting = true;
      this.changed();
      if (!this.paused) this.schedule();
      return;
    }
    this.presenting = false;
    this.view = this.state;
    this.changed();
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    const delay = eventDelay(this.current, this.speed, this.state.config);
    if (Number.isFinite(delay)) this.timer = setTimeout(() => this.next(), delay);
  }
  setSpeed(speed) {
    this.speed = speed === 'step' ? 'manual' : ['manual', 'normal', 'fast', 'instant'].includes(speed) ? speed : 'normal';
    clearTimeout(this.timer);
    this.timer = null;
    if (this.busy && !this.paused) this.schedule();
    this.changed();
  }
  togglePause() {
    this.paused = !this.paused;
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.paused && this.busy) this.schedule();
    this.changed();
  }
  step() {
    // Manual mode already owns the wait. Avoid leaving an invisible pause behind
    // when the player switches a manually stepped sequence back to Normal/Fast.
    if (this.speed !== 'manual') this.paused = true;
    this.next();
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    // Skip waits only: snapshots, persistent visual context, and all raw events survive.
    while (this.pending.length) {
      const event = this.pending.shift();
      this.consume(event, describeEvent(event).major);
    }
    this.view = this.state;
    this.presenting = false;
    this.changed();
  }
  dispose() { clearTimeout(this.timer); this.timer = null; }
}
