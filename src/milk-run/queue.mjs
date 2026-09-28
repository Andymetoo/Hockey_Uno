// Rules are resolved into snapshots. Only the snapshot of the presented event
// becomes visible. Decisions cannot run until the presentation queue is empty.
export class ResolutionQueue {
  constructor({ state, dispatch, onChange, saved }) {
    this.dispatch = dispatch;
    this.onChange = onChange;
    this.state = saved?.state ?? state;
    this.view = saved?.view ?? this.state;
    this.pending = saved?.pending ?? [];
    this.log = saved?.log ?? [];
    this.current = saved?.current ?? null;
    this.speed = saved?.speed ?? (this.state.config.animationMs === 0 ? 'instant' : 'normal');
    this.paused = Boolean(saved?.pending?.length); // Resume pending events deliberately.
    this.timer = null;
    this.presenting = false;
  }
  get busy() { return this.presenting || this.pending.length > 0; }
  export() {
    return { version: 1, state: this.state, view: this.view, pending: this.pending,
      log: this.log, current: this.current, speed: this.speed };
  }
  changed() { this.onChange?.(this); }
  send(command) {
    if (this.busy) throw new Error('Let the current event sequence finish first.');
    const result = this.dispatch(this.state, command);
    this.state = result.state;
    this.pending = result.events;
    if (!this.pending.length) this.view = this.state;
    this.presenting = this.pending.length > 0;
    this.next();
  }
  next() {
    clearTimeout(this.timer);
    const event = this.pending.shift();
    if (!event) {
      this.presenting = false;
      this.view = this.state;
      this.changed();
      return;
    }
    this.presenting = true;
    const { state, ...entry } = event;
    this.view = state ?? this.view;
    this.current = { ...entry, round: this.view.round, sequence: this.log.length + 1 };
    this.log.push(this.current);
    this.changed();
    if (!this.paused) this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    const delay = this.speed === 'instant' ? 0 : this.speed === 'fast' ? 110 : (this.state.config.animationMs ?? 750);
    this.timer = setTimeout(() => this.next(), delay);
  }
  setSpeed(speed) {
    this.speed = speed;
    if (this.busy && !this.paused) this.schedule();
    this.changed();
  }
  togglePause() {
    this.paused = !this.paused;
    clearTimeout(this.timer);
    if (!this.paused && this.busy) this.schedule();
    this.changed();
  }
  step() { this.paused = true; this.next(); }
  flush() {
    clearTimeout(this.timer);
    // Skip delays while retaining every event in the persistent log.
    while (this.pending.length) {
      const { state, ...event } = this.pending.shift();
      this.view = state ?? this.view;
      this.current = { ...event, round: this.view.round, sequence: this.log.length + 1 };
      this.log.push(this.current);
    }
    this.view = this.state;
    this.presenting = false;
    this.changed();
  }
  dispose() { clearTimeout(this.timer); }
}
