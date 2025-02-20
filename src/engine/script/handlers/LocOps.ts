import ParamType from '#/cache/config/ParamType.js';
import LocType from '#/cache/config/LocType.js';
import SeqType from '#/cache/config/SeqType.js';
import {ParamHelper} from '#/cache/config/ParamHelper.js';

import World from '#/engine/World.js';

import ScriptOpcode from '#/engine/script/ScriptOpcode.js';
import {CommandHandlers} from '#/engine/script/ScriptRunner.js';
import {LocIterator} from '#/engine/script/ScriptIterators.js';

import Loc from '#/engine/entity/Loc.js';
import {CoordGrid} from '#/engine/CoordGrid.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';

import {
    check,
    CoordValid,
    DurationValid,
    LocAngleValid,
    LocShapeValid,
    LocTypeValid,
    ParamTypeValid,
    SeqTypeValid
} from '#/engine/script/ScriptValidators.js';

import {LocAngle, LocShape} from '@2004scape/rsmod-pathfinder';

const LocOps: CommandHandlers = {
    [ScriptOpcode.LOC_ADD]: state => {
        const [coord, type, angle, shape, duration] = state.popInts(5);

        const position: CoordGrid = check(coord, CoordValid);
        const locType: LocType = check(type, LocTypeValid);
        const locAngle: LocAngle = check(angle, LocAngleValid);
        const locShape: LocShape = check(shape, LocShapeValid);
        check(duration, DurationValid);

        const created: Loc = new Loc(position.level, position.x, position.z, locType.width, locType.length, EntityLifeCycle.DESPAWN, locType.id, locShape, locAngle);
        const locs: IterableIterator<Loc> = World.gameMap.getZone(position.x, position.z, position.level).getLocsUnsafe(CoordGrid.packZoneCoord(position.x, position.z));
        for (const loc of locs) {
            if (loc !== created && loc.angle === locAngle && loc.shape === locShape) {
                World.removeLoc(loc, duration);
                break;
            }
        }
        World.addLoc(created, duration);
        const primary = state.intOperand === 0;
        state.setActiveLoc(primary, created);
    },

    [ScriptOpcode.LOC_ANGLE]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeLoc(primary).angle, LocAngleValid));
    },

    // https://x.com/JagexAsh/status/1773801749175812307
    [ScriptOpcode.LOC_ANIM]: state => {
        const seqType: SeqType = check(state.popInt(), SeqTypeValid);

        const primary = state.intOperand === 0;
        World.animLoc(state.activeLoc(primary), seqType.id);
    },

    [ScriptOpcode.LOC_CATEGORY]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeLoc(primary).type, LocTypeValid).category);
    },

    [ScriptOpcode.LOC_CHANGE]: state => {
        const [id, duration] = state.popInts(2);

        const locType: LocType = check(id, LocTypeValid);
        check(duration, DurationValid);

        const primary = state.intOperand === 0;
        const loc = state.activeLoc(primary);

        World.removeLoc(loc, duration);

        // const loc = new Loc(state.activeLoc.level, state.activeLoc.x, state.activeLoc.z, locType.width, locType.length, EntityLifeCycle.DESPAWN, id, state.activeLoc.shape, state.activeLoc.angle);
        // World.addLoc(loc, duration);

        const {level, x, z, angle, shape} = loc;
        const created: Loc = new Loc(level, x, z, locType.width, locType.length, EntityLifeCycle.DESPAWN, locType.id, shape, angle);
        const locs: IterableIterator<Loc> = World.gameMap.getZone(x, z, level).getLocsUnsafe(CoordGrid.packZoneCoord(x, z));
        for (const loc of locs) {
            if (loc !== created && loc.angle === angle && loc.shape === shape) {
                World.removeLoc(loc, duration);
                break;
            }
        }
        World.addLoc(created, duration);
        state.setActiveLoc(primary, created);
    },

    [ScriptOpcode.LOC_COORD]: state => {
        const primary = state.intOperand === 0;
        const loc = state.activeLoc(primary);

        state.pushInt(CoordGrid.packCoord(loc.level, loc.x, loc.z));
    },

    [ScriptOpcode.LOC_DEL]: state => {
        const duration: number = check(state.popInt(), DurationValid);

        const primary = state.intOperand === 0;
        const loc = state.activeLoc(primary);

        const {level, x, z, angle, shape} = loc;
        const locs: IterableIterator<Loc> = World.gameMap.getZone(x, z, level).getLocsUnsafe(CoordGrid.packZoneCoord(x, z));
        for (const loc of locs) {
            if (loc !== loc && loc.angle === angle && loc.shape === shape) {
                World.removeLoc(loc, duration);
                break;
            }
        }
        World.removeLoc(loc, duration);
    },

    [ScriptOpcode.LOC_FIND]: state => {
        const [coord, locId] = state.popInts(2);

        const locType: LocType = check(locId, LocTypeValid);
        const position: CoordGrid = check(coord, CoordValid);

        const loc = World.getLoc(position.x, position.z, position.level, locType.id);
        if (!loc) {
            state.pushInt(0);
            return;
        }

        const primary = state.intOperand === 0;
        state.setActiveLoc(primary, loc);
        state.pushInt(1);
    },

    [ScriptOpcode.LOC_FINDALLZONE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        state.locIterator = new LocIterator(World.currentTick, coord.level, coord.x, coord.z);
    },

    [ScriptOpcode.LOC_FINDNEXT]: state => {
        const result = state.locIterator?.next();
        if (!result || result.done) {
            state.pushInt(0);
            return;
        }

        const primary = state.intOperand === 0;
        state.setActiveLoc(primary, result.value);
        state.pushInt(1);
    },

    [ScriptOpcode.LOC_PARAM]: state => {
        const paramType: ParamType = check(state.popInt(), ParamTypeValid);

        const primary = state.intOperand === 0;
        const locType: LocType = check(state.activeLoc(primary).type, LocTypeValid);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramType.id, locType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramType.id, locType, paramType.defaultInt));
        }
    },

    [ScriptOpcode.LOC_TYPE]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeLoc(primary).type, LocTypeValid).id);
    },

    [ScriptOpcode.LOC_NAME]: state => {
        const primary = state.intOperand === 0;
        state.pushString(check(state.activeLoc(primary).type, LocTypeValid).name ?? 'null');
    },

    [ScriptOpcode.LOC_SHAPE]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeLoc(primary).shape, LocShapeValid));
    }
};

export default LocOps;
