import type {
  SessionLogEvent,
  SessionLogEventType,
  SourceModule,
  TraceRef,
} from "../contracts/aura";

export class SessionLogger {
  private readonly session_id: string;
  private readonly scenario_id: string;
  private sequence = 0;
  private events: SessionLogEvent[] = [];

  constructor(session_id: string, scenario_id: string) {
    this.session_id = session_id;
    this.scenario_id = scenario_id;
  }

  append(params: {
    sim_time_sec: number;
    event_type: SessionLogEventType;
    source_module: SourceModule;
    phase_id?: string;
    payload: Record<string, unknown>;
    trace_refs?: TraceRef[];
  }): SessionLogEvent {
    this.sequence += 1;

    const event: SessionLogEvent = {
      event_id: `evt_${String(this.sequence).padStart(4, "0")}`,
      session_id: this.session_id,
      scenario_id: this.scenario_id,
      sim_time_sec: params.sim_time_sec,
      event_type: params.event_type,
      source_module: params.source_module,
      phase_id: params.phase_id,
      payload: params.payload,
      trace_refs: params.trace_refs ?? [],
    };

    this.events = [...this.events, event];
    return event;
  }

  list(): SessionLogEvent[] {
    return [...this.events];
  }
}
