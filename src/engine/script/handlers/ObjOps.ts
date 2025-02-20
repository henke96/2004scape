import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import { ParamHelper } from '#/cache/config/ParamHelper.js';
import ParamType from '#/cache/config/ParamType.js';

import World from '#/engine/World.js';

import ScriptOpcode from '#/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';

import Obj from '#/engine/entity/Obj.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';

import { check, CoordValid, DurationValid, InvTypeValid, ObjStackValid, ObjTypeValid, ParamTypeValid } from '#/engine/script/ScriptValidators.js';
import Environment from '#/util/Environment.js';

const ObjOps: CommandHandlers = {
    // https://x.com/JagexAsh/status/1679942100249464833
    // https://x.com/NobodyImpo74600/status/1791469645939065036
    [ScriptOpcode.OBJ_ADD]: state => {
        const [coord, objId, count, duration] = state.popInts(4);

        if (objId === -1 || count === -1) {
            return;
        }

        const objType: ObjType = check(objId, ObjTypeValid);
        check(duration, DurationValid);
        const position: CoordGrid = check(coord, CoordValid);
        check(count, ObjStackValid);

        if (objType.dummyitem !== 0) {
            throw new Error(`attempted to add dummy item: ${objType.debugname}`);
        }

        if (objType.members && !Environment.NODE_MEMBERS) {
            return;
        }

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (!objType.stackable) {
            for (let i = 0; i < count; i++) {
                const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, 1);
                World.addObj(obj, player.hash64, duration);

                state.setActiveObj(true, obj);
            }
        } else {
            const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, count);
            World.addObj(obj, player.hash64, duration);

            state.setActiveObj(true, obj);
        }
    },

    // https://x.com/JagexAsh/status/1778879334167548366
    [ScriptOpcode.OBJ_ADDALL]: state => {
        const [coord, objId, count, duration] = state.popInts(4);

        if (objId === -1 || count === -1) {
            return;
        }

        const objType: ObjType = check(objId, ObjTypeValid);
        check(duration, DurationValid);
        const position: CoordGrid = check(coord, CoordValid);
        check(count, ObjStackValid);

        if (objType.dummyitem !== 0) {
            throw new Error(`attempted to add dummy item: ${objType.debugname}`);
        }

        if (objType.members && !Environment.NODE_MEMBERS) {
            return;
        }

        const primary = state.intOperand === 0;
        if (!objType.stackable || count === 1) {
            for (let i = 0; i < count; i++) {
                const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, 1);
                World.addObj(obj, Obj.NO_RECEIVER, duration);
                state.setActiveObj(primary, obj);
            }
        } else {
            const obj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objId, count);
            World.addObj(obj, Obj.NO_RECEIVER, duration);
            state.setActiveObj(primary, obj);
        }
    },

    [ScriptOpcode.OBJ_PARAM]: state => {
        const paramType: ParamType = check(state.popInt(), ParamTypeValid);

        const primary = state.intOperand === 0;
        const objType: ObjType = check(state.activeObj(primary).type, ObjTypeValid);
        if (paramType.isString()) {
            state.pushString(ParamHelper.getStringParam(paramType.id, objType, paramType.defaultString));
        } else {
            state.pushInt(ParamHelper.getIntParam(paramType.id, objType, paramType.defaultInt));
        }
    },

    [ScriptOpcode.OBJ_NAME]: state => {
        const primary = state.intOperand === 0;
        const objType: ObjType = check(state.activeObj(primary).type, ObjTypeValid);

        state.pushString(objType.name ?? objType.debugname ?? 'null');
    },

    [ScriptOpcode.OBJ_DEL]: state => {
        const primary = state.intOperand === 0;
        const obj = state.activeObj(primary);

        const duration: number = ObjType.get(obj.type).respawnrate;
        World.removeObj(obj, duration);
    },

    [ScriptOpcode.OBJ_COUNT]: state => {
        const primary = state.intOperand === 0;
        const obj = state.activeObj(primary);

        if (obj.isValid()) {
            state.pushInt(obj.count);
            return;
        }

        state.pushInt(0);
    },

    [ScriptOpcode.OBJ_TYPE]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(check(state.activeObj(primary).type, ObjTypeValid).id);
    },

    // https://x.com/JagexAsh/status/1679942100249464833
    [ScriptOpcode.OBJ_TAKEITEM]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        const obj: Obj = state.activeObj(true);
        const objType = ObjType.get(obj.type);

        const player = state.activePlayer(true);
        if (!obj.isValid(player.hash64)) {
            return false;
        }

        player.invAdd(invType.id, obj.type, obj.count);

        if (obj.lifecycle === EntityLifeCycle.RESPAWN) {
            player.addWealthLog(obj.count * objType.cost, `Picked up ${objType.debugname} x${obj.count}`);
            World.removeObj(obj, objType.respawnrate);
        } else if (obj.lifecycle === EntityLifeCycle.DESPAWN) {
            player.addWealthLog(obj.count * objType.cost, `Picked up ${objType.debugname} x${obj.count}`);
            World.removeObj(obj, 0);
        }
    },

    [ScriptOpcode.OBJ_COORD]: state => {
        const primary = state.intOperand === 0;
        const obj = state.activeObj(primary);
        state.pushInt(CoordGrid.packCoord(obj.level, obj.x, obj.z));
    },

    [ScriptOpcode.OBJ_FIND]: state => {
        const [coord, objId] = state.popInts(2);

        const objType: ObjType = check(objId, ObjTypeValid);
        const position: CoordGrid = check(coord, CoordValid);

        const obj = World.getObj(position.x, position.z, position.level, objType.id, state.activePlayer(true).hash64);
        if (!obj) {
            state.pushInt(0);
            return;
        }

        state.setActiveObj(true, obj);
        state.pushInt(1);
    }

    // obj_setvar // https://x.com/JagexAsh/status/1679942100249464833
    // obj_adddelayed // https://x.com/JagexAsh/status/1730321158858276938
};

export default ObjOps;
