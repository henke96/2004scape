import ParamType from '#/cache/config/ParamType.js';
import NpcType from '#/cache/config/NpcType.js';
import { ParamHelper } from '#/cache/config/ParamHelper.js';
import SpotanimType from '#/cache/config/SpotanimType.js';

import World from '#/engine/World.js';

import ScriptOpcode from '#/engine/script/ScriptOpcode.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import { NpcIterator } from '#/engine/script/ScriptIterators.js';

import Loc from '#/engine/entity/Loc.js';
import Obj from '#/engine/entity/Obj.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import NpcIteratorType from '#/engine/entity/NpcIteratorType.js';
import Npc from '#/engine/entity/Npc.js';
import NpcMode from '#/engine/entity/NpcMode.js';
import Entity from '#/engine/entity/Entity.js';
import Interaction from '#/engine/entity/Interaction.js';
import HuntVis from '#/engine/entity/hunt/HuntVis.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';

import { check, CoordValid, DurationValid, HitTypeValid, HuntTypeValid, HuntVisValid, NpcModeValid, NpcStatValid, NpcTypeValid, NumberNotNull, ParamTypeValid, QueueValid, SpotAnimTypeValid } from '#/engine/script/ScriptValidators.js';

const NpcOps: CommandHandlers = {
    [ScriptOpcode.NPC_FINDUID]: state => {
        const npcUid = state.popInt();
        const slot = npcUid & 0xffff;
        const expectedType = (npcUid >> 16) & 0xffff;
        const npc = World.getNpc(slot);

        if (!npc || npc.type !== expectedType) {
            state.pushInt(0);
            return;
        }

        const primary = state.intOperand === 0;
        state.setActiveNpc(primary, npc);
        state.pushInt(1);
    },

    [ScriptOpcode.NPC_ADD]: state => {
        const [coord, id, duration] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        const npcType: NpcType = check(id, NpcTypeValid);
        check(duration, DurationValid);

        const npc = new Npc(position.level, position.x, position.z, npcType.size, npcType.size, EntityLifeCycle.DESPAWN, World.getNextNid(), npcType.id, npcType.moverestrict, npcType.blockwalk);
        World.addNpc(npc, duration);
        const primary = state.intOperand === 0;
        state.setActiveNpc(primary, npc);
    },

    [ScriptOpcode.NPC_ANIM]: state => {
        const delay = check(state.popInt(), NumberNotNull);
        const seq = state.popInt();

        const primary = state.intOperand === 0;
        state.activeNpc(primary).playAnimation(seq, delay);
    },

    [ScriptOpcode.NPC_BASESTAT]: state => {
        const stat = check(state.popInt(), NpcStatValid);

        const primary = state.intOperand === 0;
        state.pushInt(state.activeNpc(primary).baseLevels[stat]);
    },

    [ScriptOpcode.NPC_CATEGORY]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeNpc(primary).type, NpcTypeValid).category);
    },

    // https://x.com/JagexAsh/status/1821835323808026853
    [ScriptOpcode.NPC_COORD]: state => {
        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);
        state.pushInt(CoordGrid.packCoord(npc.level, npc.x, npc.z));
    },

    [ScriptOpcode.NPC_DEL]: state => {
        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);
        World.removeNpc(npc, check(npc.type, NpcTypeValid).respawnrate);
    },

    [ScriptOpcode.NPC_DELAY]: state => {
        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        // npcs don't have protected access, so delays can be overridden
        npc.cancelSuspendedScript();

        npc.delayedUntil = World.currentTick + 1 + check(state.popInt(), NumberNotNull);
        npc.suspendedScript = state;
        state.execution = ScriptState.DELAYED;
        state.corruptProtectedAccess(true);
        state.corruptProtectedAccess(false);
    },

    [ScriptOpcode.NPC_FACESQUARE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        state.activeNpc(primary).faceSquare(coord.x, coord.z);
    },

    [ScriptOpcode.NPC_FINDEXACT]: state => {
        const [coord, id] = state.popInts(2);

        const position: CoordGrid = check(coord, CoordValid);
        const npcType: NpcType = check(id, NpcTypeValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, 0, 0, NpcIteratorType.ZONE);

        for (const npc of state.npcIterator) {
            if (npc.type === npcType.id && npc.x === position.x && npc.level === position.level && npc.z === position.z) {
                const primary = state.intOperand === 0;
                state.setActiveNpc(primary, npc);
                state.pushInt(1);
                return;
            }
        }
        state.pushInt(0);
        return;
    },

    [ScriptOpcode.NPC_FINDHERO]: state => {
        const primary = state.intOperand === 0;
        const uid = state.activeNpc(primary).heroPoints.findHero();
        if (uid === -1) {
            state.pushInt(0);
            return;
        }

        const player = World.getPlayerByUid(uid);
        if (!player) {
            state.pushInt(0);
            return;
        }
        state.setActivePlayer(true, player);
        state.pushInt(1);
    },

    [ScriptOpcode.NPC_PARAM]: state => {
        const paramType: ParamType = check(state.popInt(), ParamTypeValid);

        const primary = state.intOperand === 0;
        const npcType: NpcType = check(state.activeNpc(primary).type, NpcTypeValid);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramType.id, npcType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramType.id, npcType, paramType.defaultInt));
        }
    },

    // https://x.com/JagexAsh/status/1570357528172859392
    [ScriptOpcode.NPC_QUEUE]: state => {
        const delay = check(state.popInt(), NumberNotNull);
        const arg = state.popInt();
        const queueId = check(state.popInt(), QueueValid);

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        const npcType: NpcType = check(npc.type, NpcTypeValid);
        const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE1 + queueId - 1, npcType.id, npcType.category);

        if (script) {
            npc.enqueueScript(script, delay, arg);
        }
    },

    [ScriptOpcode.NPC_RANGE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);
        if (coord.level !== npc.level) {
            state.pushInt(-1);
        } else {
            state.pushInt(
                CoordGrid.distanceTo(npc, {
                    x: coord.x,
                    z: coord.z,
                    width: 1,
                    length: 1
                })
            );
        }
    },

    [ScriptOpcode.NPC_SAY]: state => {
        const primary = state.intOperand === 0;
        state.activeNpc(primary).say(state.popString());
    },

    [ScriptOpcode.NPC_SETHUNT]: state => {
        const primary = state.intOperand === 0;
        state.activeNpc(primary).huntrange = check(state.popInt(), NumberNotNull);
    },

    [ScriptOpcode.NPC_SETHUNTMODE]: state => {
        // TODO is this authentic? or is there npc_clearhuntmode (or similar)?
        const huntTypeId = state.popInt();

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);
        if (huntTypeId === -1) {
            npc.huntMode = -1;
        } else {
            npc.huntMode = check(huntTypeId, HuntTypeValid).id;
        }
    },

    // https://x.com/JagexAsh/status/1795184135327089047
    // https://x.com/JagexAsh/status/1821835323808026853
    [ScriptOpcode.NPC_SETMODE]: state => {
        const mode = check(state.popInt(), NpcModeValid);

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        npc.clearWaypoints();
        if (mode === NpcMode.NULL || mode === NpcMode.NONE || mode === NpcMode.WANDER || mode === NpcMode.PATROL) {
            npc.clearInteraction();
            npc.targetOp = mode;
            return;
        }
        npc.targetOp = mode;
        let target: Entity | null;
        if (mode >= NpcMode.OPNPC1) {
            target = state.activeNpcOrNull(!primary);
        } else if (mode >= NpcMode.OPOBJ1) {
            target = state._activeObj;
        } else if (mode >= NpcMode.OPLOC1) {
            target = state._activeLoc;
        } else {
            target = state._activePlayer;
        }

        if (target) {
            if (target instanceof Npc || target instanceof Obj || target instanceof Loc) {
                npc.setInteraction(Interaction.SCRIPT, target, mode, { type: target.type, com: -1 });
            } else {
                npc.setInteraction(Interaction.SCRIPT, target, mode);
            }
        } else {
            npc.noMode();
        }
    },

    [ScriptOpcode.NPC_STAT]: state => {
        const stat = check(state.popInt(), NpcStatValid);

        const primary = state.intOperand === 0;
        state.pushInt(state.activeNpc(primary).levels[stat]);
    },

    [ScriptOpcode.NPC_STATHEAL]: state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, NpcStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        const base = npc.baseLevels[stat];
        const current = npc.levels[stat];
        const healed = current + (constant + (current * percent) / 100);
        npc.levels[stat] = Math.min(healed, base);

        // reset hero points if hp current == base
        if (stat === 0 && npc.levels[stat] === npc.baseLevels[stat]) {
            npc.heroPoints.clear();
        }
    },

    [ScriptOpcode.NPC_TYPE]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeNpc(primary).type, NpcTypeValid).id);
    },

    [ScriptOpcode.NPC_DAMAGE]: state => {
        const amount = check(state.popInt(), NumberNotNull);
        const type = check(state.popInt(), HitTypeValid);

        const primary = state.intOperand === 0;
        state.activeNpc(primary).applyDamage(amount, type);
    },

    [ScriptOpcode.NPC_NAME]: state => {
        const primary = state.intOperand === 0;
        state.pushString(check(state.activeNpc(primary).type, NpcTypeValid).name ?? 'null');
    },

    [ScriptOpcode.NPC_UID]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activeNpc(primary).uid);
    },

    [ScriptOpcode.NPC_SETTIMER]: state => {
        const primary = state.intOperand === 0;
        state.activeNpc(primary).setTimer(check(state.popInt(), NumberNotNull));
    },

    [ScriptOpcode.SPOTANIM_NPC]: state => {
        const delay = check(state.popInt(), NumberNotNull);
        const height = check(state.popInt(), NumberNotNull);
        const spotanimType: SpotanimType = check(state.popInt(), SpotAnimTypeValid);

        const primary = state.intOperand === 0;
        state.activeNpc(primary).spotanim(spotanimType.id, height, delay);
    },

    // https://x.com/JagexAsh/status/1796460129430433930
    [ScriptOpcode.NPC_FIND]: state => {
        const [coord, npc, distance, checkVis] = state.popInts(4);

        const position: CoordGrid = check(coord, CoordValid);
        const npcType: NpcType = check(npc, NpcTypeValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        let closestNpc;
        let closestDistance = distance;

        const npcs = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE);

        for (const npc of npcs) {
            if (npc && npc.type === npcType.id) {
                const npcDistance = CoordGrid.distanceToSW(position, npc);
                if (npcDistance <= closestDistance) {
                    closestNpc = npc;
                    closestDistance = npcDistance;
                }
            }
        }
        if (!closestNpc) {
            state.pushInt(0);
            return;
        }
        const primary = state.intOperand === 0;
        state.setActiveNpc(primary, closestNpc);
        state.pushInt(1);
    },

    // https://x.com/JagexAsh/status/1796878374398246990
    [ScriptOpcode.NPC_FINDALLANY]: state => {
        const [coord, distance, checkVis] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE);
    },

    [ScriptOpcode.NPC_FINDALL]: state => {
        const [coord, npc, distance, checkVis] = state.popInts(4);

        const position: CoordGrid = check(coord, CoordValid);
        check(distance, NumberNotNull);
        const npcType: NpcType = check(npc, NpcTypeValid);
        const huntvis: HuntVis = check(checkVis, HuntVisValid);

        state.npcIterator = new NpcIterator(World.currentTick, position.level, position.x, position.z, distance, huntvis, NpcIteratorType.DISTANCE, npcType);
    },

    [ScriptOpcode.NPC_FINDALLZONE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.npcIterator = new NpcIterator(World.currentTick, coord.level, coord.x, coord.z, 0, 0, NpcIteratorType.ZONE);
    },

    [ScriptOpcode.NPC_FINDNEXT]: state => {
        const result = state.npcIterator?.next();
        if (!result || result.done) {
            // no more npcs in zone
            state.pushInt(0);
            return;
        }

        const primary = state.intOperand === 0;
        state.setActiveNpc(primary, result.value);
        state.pushInt(1);
    },

    [ScriptOpcode.NPC_TELE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        state.activeNpc(primary).teleport(coord.x, coord.z, coord.level);
    },

    // https://x.com/JagexAsh/status/1821835323808026853
    // https://x.com/JagexAsh/status/1780932943038345562
    [ScriptOpcode.NPC_WALK]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        state.activeNpc(primary).queueWaypoint(coord.x, coord.z);
    },

    [ScriptOpcode.NPC_CHANGETYPE]: state => {
        const primary = state.intOperand === 0;
        state.activeNpc(primary).changeType(check(state.popInt(), NpcTypeValid).id);
    },

    [ScriptOpcode.NPC_GETMODE]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activeNpc(primary).targetOp);
    },

    // https://x.com/JagexAsh/status/1704492467226091853
    [ScriptOpcode.NPC_HEROPOINTS]: state => {
        const primary = state.intOperand === 0;
        state.activeNpc(primary).heroPoints.addHero(state.activePlayer(true).uid, check(state.popInt(), NumberNotNull));
    },

    // https://x.com/JagexAsh/status/1780932943038345562
    [ScriptOpcode.NPC_WALKTRIGGER]: state => {
        const [queueId, arg] = state.popInts(2);

        check(queueId, QueueValid);

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        npc.walktrigger = queueId - 1;
        npc.walktriggerArg = arg;
    },

    [ScriptOpcode.NPC_STATADD]: state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, NpcStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        const current = npc.levels[stat];
        const added = current + (constant + (current * percent) / 100);
        npc.levels[stat] = Math.min(added, 255);

        if (stat === 0 && npc.levels[stat] >= npc.baseLevels[stat]) {
            npc.heroPoints.clear();
        }
    },

    [ScriptOpcode.NPC_STATSUB]: state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, NpcStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        const current = npc.levels[stat];
        const subbed = current - (constant + (current * percent) / 100);
        npc.levels[stat] = Math.max(subbed, 0);
    },

    // https://twitter.com/JagexAsh/status/1614498680144527360
    [ScriptOpcode.NPC_ATTACKRANGE]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeNpc(primary).type, NpcTypeValid).attackrange);
    },

    // https://x.com/JagexAsh/status/1821492251429679257
    [ScriptOpcode.NPC_HASOP]: state => {
        const op = state.popInt();

        check(op, NumberNotNull);

        const primary = state.intOperand === 0;
        const npcType: NpcType = NpcType.get(state.activeNpc(primary).type);

        if (!npcType.op) {
            state.pushInt(0);
            return;
        }

        state.pushInt(npcType.op[op - 1] ? 1 : 0);
    },

    // https://x.com/JagexAsh/status/1432296606376906752
    [ScriptOpcode.NPC_ARRIVEDELAY]: state => {
        const primary = state.intOperand === 0;
        const npc = state.activeNpc(primary);

        if (npc.lastMovement < World.currentTick - 1) {
            return;
        }
        // If npc moved 1 tick ago, delay for 1 tick. If npc moved this tick, delay for 2 ticks
        if (npc.lastMovement === World.currentTick - 1) {
            npc.delayedUntil = World.currentTick + 1;
        } else {
            npc.delayedUntil = World.currentTick + 2;
        }
        npc.suspendedScript = state;
        state.execution = ScriptState.DELAYED;
        state.corruptProtectedAccess(true);
        state.corruptProtectedAccess(false);
    }
};

export default NpcOps;
