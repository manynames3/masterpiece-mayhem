import type { BeamParams } from './beam';
import type { BossParams } from './boss';
import type { BridgeParams } from './bridge';
import type { CompositeParams } from './composite';
import type { CourierParams } from './courier';
import type { CrackParams } from './crack';
import type { CrittersParams } from './critters';
import type { DispatchParams } from './dispatch';
import type { DotsParams } from './dots';
import type { FlowParams } from './flow';
import type { PeelParams } from './peel';
import type { RunnerParams } from './runner';
import type { ScrubParams } from './scrub';
import type { TouchParams } from './touch';

/** Discriminated union of every mechanic family's typed stage configuration. */
export type MechanicParams =
  | ScrubParams | CrittersParams | CrackParams | PeelParams | CourierParams | BeamParams | RunnerParams
  | FlowParams | DispatchParams | DotsParams | BossParams | BridgeParams | TouchParams | CompositeParams;

export type MechanicType = MechanicParams['type'];
