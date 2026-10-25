import type { Mechanic } from '../mechanic';
import { BeamMechanic } from './beam';
import { BossMechanic } from './boss';
import { BridgeMechanic } from './bridge';
import { CompositeMechanic } from './composite';
import { CourierMechanic } from './courier';
import { CrackMechanic } from './crack';
import { CrittersMechanic } from './critters';
import { DispatchMechanic } from './dispatch';
import { DotsMechanic } from './dots';
import { FlowMechanic } from './flow';
import type { MechanicParams, MechanicType } from './params';
import { PeelMechanic } from './peel';
import { RunnerMechanic } from './runner';
import { ScrubMechanic } from './scrub';
import { TouchMechanic } from './touch';

export function createMechanic(p: MechanicParams): Mechanic {
  switch (p.type) {
    case 'scrub': return new ScrubMechanic(p);
    case 'critters': return new CrittersMechanic(p);
    case 'crack': return new CrackMechanic(p);
    case 'peel': return new PeelMechanic(p);
    case 'courier': return new CourierMechanic(p);
    case 'beam': return new BeamMechanic(p);
    case 'runner': return new RunnerMechanic(p);
    case 'flow': return new FlowMechanic(p);
    case 'dispatch': return new DispatchMechanic(p);
    case 'dots': return new DotsMechanic(p);
    case 'boss': return new BossMechanic(p);
    case 'bridge': return new BridgeMechanic(p);
    case 'touch': return new TouchMechanic(p);
    case 'composite': return new CompositeMechanic(p, createMechanic);
  }
}

export const MECHANIC_FAMILIES: MechanicType[] = ['scrub', 'critters', 'crack', 'peel', 'courier', 'beam', 'runner', 'flow', 'dispatch', 'dots', 'boss', 'bridge', 'touch', 'composite'];
