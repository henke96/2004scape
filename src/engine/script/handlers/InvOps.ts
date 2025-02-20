import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import CategoryType from '#/cache/config/CategoryType.js';

import World from '#/engine/World.js';
import { Inventory } from '#/engine/Inventory.js';

import ScriptOpcode from '#/engine/script/ScriptOpcode.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';

import Obj from '#/engine/entity/Obj.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';

import {
    CategoryTypeValid,
    check,
    CoordValid,
    DurationValid,
    InvTypeValid,
    NumberNotNull,
    ObjStackValid,
    ObjTypeValid
} from '#/engine/script/ScriptValidators.js';

const InvOps: CommandHandlers = {
    // inv config
    [ScriptOpcode.INV_ALLSTOCK]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        state.pushInt(invType.allstock ? 1 : 0);
    },

    // inv config
    [ScriptOpcode.INV_SIZE]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        state.pushInt(invType.size);
    },

    // inv config
    [ScriptOpcode.INV_DEBUGNAME]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        state.pushString(invType.debugname ?? 'null');
    },

    // inv config
    [ScriptOpcode.INV_STOCKBASE]: state => {
        const [inv, obj] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);

        if (!invType.stockobj || !invType.stockcount) {
            state.pushInt(-1);
            return;
        }

        const index = invType.stockobj.indexOf(objType.id);
        state.pushInt(index >= 0 ? invType.stockcount[index] : -1);
    },

    // inv write
    [ScriptOpcode.INV_ADD]: state => {
        const [inv, objId, count] = state.popInts(3);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(objId, ObjTypeValid);
        check(count, ObjStackValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        if (!invType.dummyinv && objType.dummyitem !== 0) {
            throw new Error(`dummyitem in non-dummyinv: ${objType.debugname} -> ${invType.debugname}`);
        }

        const overflow = count - player.invAdd(invType.id, objType.id, count, false);
        if (overflow > 0) {
            if (!objType.stackable || overflow === 1) {
                for (let i = 0; i < overflow; i++) {
                    const obj = new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, objType.id, 1);
                    World.addObj(obj, player.hash64, 200);
                }
            } else {
                const obj = new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, objType.id, overflow);
                World.addObj(obj, player.hash64, 200);
            }
        }
    },

    // inv write
    [ScriptOpcode.INV_CHANGESLOT]: state => {
        const [inv, find, replace, replaceCount] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const findObj : ObjType = check(find, ObjTypeValid);
        const replaceObj : ObjType = check(replace, ObjTypeValid);
        const fromInv = player.getInventory(inv);

        if (!fromInv) {
            throw new Error('inv is null');
        }

        for (let slot = 0; slot < fromInv.capacity; slot++) {
            const obj = fromInv.get(slot);
            if(!obj) {
                continue;
            }
            if(obj.id === findObj.id) {
                player.invSet(invType.id, replaceObj.id, replaceCount, slot);
                return;
            }
        }
    },

    // inv write
    [ScriptOpcode.INV_CLEAR]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        player.invClear(invType.id);
    },

    // https://x.com/JagexAsh/status/1679942100249464833
    // https://x.com/JagexAsh/status/1708084689141895625
    // inv write
    [ScriptOpcode.INV_DEL]: state => {
        const [inv, obj, count] = state.popInts(3);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        player.invDel(invType.id, objType.id, count);
    },

    // inv write
    [ScriptOpcode.INV_DELSLOT]: state => {
        const [inv, slot] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const obj = player.invGetSlot(invType.id, slot);
        if (!obj) {
            return;
        }

        player.invDelSlot(invType.id, slot);
    },

    // https://x.com/JagexAsh/status/1679942100249464833
    // inv write
    [ScriptOpcode.INV_DROPITEM]: state => {
        const [inv, coord, obj, count, duration] = state.popInts(5);

        const invType: InvType = check(inv, InvTypeValid);
        const position: CoordGrid = check(coord, CoordValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);
        check(duration, DurationValid);

        const player = state.activePlayer(true);
        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const completed = player.invDel(invType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        const floorObj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, objType.id, completed);
        World.addObj(floorObj, player.hash64, duration);
        state.setActiveObj(true, floorObj);
    },

    // https://x.com/JagexAsh/status/1679942100249464833
    // inv write
    [ScriptOpcode.INV_DROPSLOT]: state => {
        const [inv, coord, slot, duration] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        check(duration, DurationValid);
        const position: CoordGrid = check(coord, CoordValid);

        const player = state.activePlayer(true);
        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const obj = player.invGetSlot(invType.id, slot);
        if (!obj) {
            throw new Error('$slot is empty');
        }

        const objType = ObjType.get(obj.id);
        if (invType.scope === InvType.SCOPE_PERM) {
            // ammo drops are temp, without checking scope this spams in ranged combat
            player.addWealthLog(-(obj.count * objType.cost), `Dropped ${objType.debugname} x${obj.count}`);
        }

        const completed = player.invDel(invType.id, obj.id, obj.count, slot);
        if (completed === 0) {
            return;
        }

        if (!objType.stackable || completed === 1) {
            for (let i = 0; i < completed; i++) {
                const floorObj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, obj.id, 1);
                World.addObj(floorObj, player.hash64, duration);
                state.setActiveObj(true, floorObj);
            }
        } else {
            const floorObj: Obj = new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, obj.id, completed);
            World.addObj(floorObj, player.hash64, duration);
            state.setActiveObj(true, floorObj);
        }
    },

    // inv read
    [ScriptOpcode.INV_FREESPACE]: state => {
        const invType: InvType = check(state.popInt(), InvTypeValid);

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invFreeSpace(invType.id));
    },

    // inv read
    [ScriptOpcode.INV_GETNUM]: state => {
        const [inv, slot] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invGetSlot(invType.id, slot)?.count ?? 0);
    },

    // inv read
    [ScriptOpcode.INV_GETOBJ]: state => {
        const [inv, slot] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invGetSlot(invType.id, slot)?.id ?? -1);
    },

    // inv read
    [ScriptOpcode.INV_ITEMSPACE]: state => {
        const [inv, obj, count, size] = state.popInts(4);

        if (count === 0) {
            state.pushInt(0);
            return;
        }

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        if (size < 0 || size > invType.size) {
            throw new Error(`$count is out of range: ${count}`);
        }

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invItemSpace(invType.id, objType.id, count, size) === 0 ? 1 : 0);
    },

    // inv read
    [ScriptOpcode.INV_ITEMSPACE2]: state => {
        const [inv, obj, count, size] = state.popInts(4);

        if (count === 0) {
            state.pushInt(0);
            return;
        }

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invItemSpace(invType.id, objType.id, count, size));
    },

    // https://x.com/JagexAsh/status/1706983568805704126
    // inv write
    [ScriptOpcode.INV_MOVEFROMSLOT]: state => {
        const [fromInv, toInv, fromSlot] = state.popInts(3);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$from_inv requires protected access: ${fromInvType.debugname}`);
        }

        if (toInvType.protect && toInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$to_inv requires protected access: ${toInvType.debugname}`);
        }

        const { overflow, fromObj } = player.invMoveFromSlot(fromInvType.id, toInvType.id, fromSlot);
        if (overflow > 0) {
            const objType: ObjType = ObjType.get(fromObj);
            if (!objType.stackable || overflow === 1) {
                for (let i = 0; i < overflow; i++) {
                    const obj = new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, fromObj, 1);
                    World.addObj(obj, player.hash64, 200);
                }
            } else {
                const obj = new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, fromObj, overflow);
                World.addObj(obj, player.hash64, 200);
            }
        }
    },

    // https://x.com/JagexAsh/status/1706983568805704126
    // inv write
    [ScriptOpcode.INV_MOVETOSLOT]: state => {
        const [fromInv, toInv, fromSlot, toSlot] = state.popInts(4);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$from_inv requires protected access: ${fromInvType.debugname}`);
        }

        if (toInvType.protect && toInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$to_inv requires protected access: ${toInvType.debugname}`);
        }

        player.invMoveToSlot(fromInvType.id, toInvType.id, fromSlot, toSlot);
    },

    // https://x.com/JagexAsh/status/1681295591639248897
    // https://x.com/JagexAsh/status/1799020087086903511
    // inv write
    [ScriptOpcode.BOTH_MOVEINV]: state => {
        const [from, to] = state.popInts(2);

        const fromInvType: InvType = check(from, InvTypeValid);
        const toInvType: InvType = check(to, InvTypeValid);

        // move the contents of the `from` inventory into the `to` inventory between both players
        // from = active_player
        // to = .active_player
        // if both_moveinv is called as .both_moveinv, then from/to pointers are swapped

        const primary = state.intOperand === 0;
        const fromPlayer = state.activePlayer(primary);
        const toPlayer = state.activePlayer(!primary);

        if (fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED && fromPlayer.protectedAccessScript !== state) {
            throw new Error(`$from_inv requires protected access: ${fromInvType.debugname}`);
        }

        if (toInvType.protect && toInvType.scope !== InvType.SCOPE_SHARED && toPlayer.protectedAccessScript !== state) {
            throw new Error(`$to_inv requires protected access: ${toInvType.debugname}`);
        }

        const fromInv = fromPlayer.getInventory(from);
        const toInv = toPlayer.getInventory(to);

        if (!fromInv || !toInv) {
            throw new Error('inv is null');
        }

        // we're going to assume the content has made sure this will go as expected
        const wealthLog = [];  // Holds a record of the wealth for logging only
        for (let slot = 0; slot < fromInv.capacity; slot++) {
            const obj = fromInv.get(slot);
            if (!obj) {
                continue;
            }

            fromInv.delete(slot);
            toInv.add(obj.id, obj.count);

            const type = ObjType.get(obj.id);
            // Check whether we have already seen this obj.id in the wealth log
            let alreadyPresent = false;
            for (let i = 0; i < wealthLog.length; i++) {
                if (wealthLog[i].id === obj.id) {
                    // If we've seen it, increase the count
                    wealthLog[i].count += obj.count;
                    alreadyPresent = true;
                    break;
                }
            }
            if (!alreadyPresent) {
                // Otherwise, create a new entry
                wealthLog.push({ id: obj.id, count: obj.count, debugname: type.debugname, baseCost: type.cost });
            }
        }
        for (const toLog of wealthLog) {
            // Log all wealth events
            const totalValueGp = toLog.baseCost * toLog.count;
            fromPlayer.addWealthLog(-totalValueGp, 'Gave ' + toLog.debugname + ' x' + toLog.count + ' to ' + toPlayer.username);
            toPlayer.addWealthLog(totalValueGp, 'Received ' + toLog.debugname + ' x' + toLog.count + ' from ' + fromPlayer.username);
        }
    },

    // https://x.com/TheCrazy0neTv/status/1681181722811957248
    // inv write
    [ScriptOpcode.INV_MOVEITEM]: state => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$from_inv requires protected access: ${fromInvType.debugname}`);
        }

        if (toInvType.protect && toInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$to_inv requires protected access: ${toInvType.debugname}`);
        }

        const completed = player.invDel(fromInvType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        const overflow = count - player.invAdd(toInvType.id, objType.id, completed, false);
        if (overflow > 0) {
            if (!objType.stackable || overflow === 1) {
                for (let i = 0; i < overflow; i++) {
                    const obj = new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, objType.id, 1);
                    World.addObj(obj, player.hash64, 200);
                }
            } else {
                const obj = new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, objType.id, overflow);
                World.addObj(obj, player.hash64, 200);
            }
        }
    },

    // https://x.com/JagexAsh/status/1681616480763367424
    // inv write
    [ScriptOpcode.INV_MOVEITEM_CERT]: state => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        const fromInvType = check(fromInv, InvTypeValid);
        const toInvType = check(toInv, InvTypeValid);
        const objType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$from_inv requires protected access: ${fromInvType.debugname}`);
        }

        if (toInvType.protect && toInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$to_inv requires protected access: ${toInvType.debugname}`);
        }

        const completed = player.invDel(fromInvType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        let finalObj = objType.id;
        if (objType.certtemplate === -1 && objType.certlink >= 0) {
            finalObj = objType.certlink;
        }
        const overflow = count - player.invAdd(toInvType.id, finalObj, completed, false);
        if (overflow > 0) {
            // should be a stackable cert already!
            const obj = new Obj(player.level, player.x, player.z, EntityLifeCycle.DESPAWN, finalObj, overflow);
            World.addObj(obj, player.hash64, 200);
        }
    
    },

    // https://x.com/JagexAsh/status/1681616480763367424
    // inv write
    [ScriptOpcode.INV_MOVEITEM_UNCERT]: state => {
        const [fromInv, toInv, obj, count] = state.popInts(4);

        const fromInvType: InvType = check(fromInv, InvTypeValid);
        const toInvType: InvType = check(toInv, InvTypeValid);
        const objType: ObjType = check(obj, ObjTypeValid);
        check(count, ObjStackValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (fromInvType.protect && fromInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$from_inv requires protected access: ${fromInvType.debugname}`);
        }

        if (toInvType.protect && toInvType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$to_inv requires protected access: ${toInvType.debugname}`);
        }

        const completed = player.invDel(fromInvType.id, objType.id, count);
        if (completed == 0) {
            return;
        }

        if (objType.certtemplate >= 0 && objType.certlink >= 0) {
            player.invAdd(toInvType.id, objType.certlink, completed);
        } else {
            player.invAdd(toInvType.id, objType.id, completed);
        }
    },

    // inv write
    [ScriptOpcode.INV_SETSLOT]: state => {
        const [inv, slot, objId, count] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        const objType: ObjType = check(objId, ObjTypeValid);
        check(count, ObjStackValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        if (!invType.dummyinv && objType.dummyitem !== 0) {
            throw new Error(`dummyitem in non-dummyinv: ${objType.debugname} -> ${invType.debugname}`);
        }

        player.invSet(invType.id, objType.id, count, slot);
    },

    // inv read
    [ScriptOpcode.INV_TOTAL]: state => {
        const [inv, obj] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);

        // todo: error instead?
        if (obj === -1) {
            state.pushInt(0);
            return;
        }

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invTotal(invType.id, obj));
    },

    // inv read
    [ScriptOpcode.INV_TOTALCAT]: state => {
        const [inv, category] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        const catType: CategoryType = check(category, CategoryTypeValid);

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invTotalCat(invType.id, catType.id));
    },

    // inv protocol
    [ScriptOpcode.INV_TRANSMIT]: state => {
        const [inv, com] = state.popInts(2);

        const invType: InvType = check(inv, InvTypeValid);
        check(com, NumberNotNull);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        player.invListenOnCom(invType.id, com, player.uid);
    },

    // inv protocol
    [ScriptOpcode.INVOTHER_TRANSMIT]: state => {
        const [uid, inv, com] = state.popInts(3);

        check(uid, NumberNotNull);
        const invType: InvType = check(inv, InvTypeValid);
        check(com, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).invListenOnCom(invType.id, com, uid);
    },

    // inv protocol
    [ScriptOpcode.INV_STOPTRANSMIT]: state => {
        const com = check(state.popInt(), NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).invStopListenOnCom(com);
    },

    // inv write
    [ScriptOpcode.BOTH_DROPSLOT]: state => {
        const [inv, coord, slot, duration] = state.popInts(4);

        const invType: InvType = check(inv, InvTypeValid);
        check(duration, DurationValid);
        const position: CoordGrid = check(coord, CoordValid);

        // from = active_player
        // to = .active_player
        // if both_dropslot is called as .both_dropslot, then from/to pointers are swapped

        const primary = state.intOperand === 0;
        const fromPlayer = state.activePlayer(primary);
        const toPlayer = state.activePlayer(!primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && fromPlayer.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const obj = fromPlayer.invGetSlot(invType.id, slot);
        if (!obj) {
            throw new Error('$slot is empty');
        }

        const objType: ObjType = ObjType.get(obj.id);
        if (invType.scope === InvType.SCOPE_PERM) {
            fromPlayer.addWealthLog(-(obj.count * objType.cost), `Dropped ${objType.debugname} x${obj.count}`);
        }

        const completed: number = fromPlayer.invDel(invType.id, obj.id, obj.count, slot);
        if (completed === 0) {
            return;
        }

        if (!objType.tradeable) {
            return; // stop untradables after delete.
        }

        World.addObj(new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, obj.id, completed), toPlayer.hash64, duration);
    },

    // https://x.com/JagexAsh/status/1778879334167548366
    // inv write
    [ScriptOpcode.INV_DROPALL]: state => {
        const [inv, coord, duration] = state.popInts(3);

        const invType: InvType = check(inv, InvTypeValid);
        check(duration, DurationValid);
        const position: CoordGrid = check(coord, CoordValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (invType.protect && invType.scope !== InvType.SCOPE_SHARED && player.protectedAccessScript !== state) {
            throw new Error(`$inv requires protected access: ${invType.debugname}`);
        }

        const inventory: Inventory | null = player.getInventory(invType.id);
        if (!inventory) {
            return;
        }

        const wealthLog = [];  // Holds a record of the wealth for logging only
        for (let slot: number = 0; slot < inventory.capacity; slot++) {
            const obj = inventory.get(slot);
            if (!obj) {
                continue;
            }

            const objType: ObjType = ObjType.get(obj.id);

            if (invType.scope === InvType.SCOPE_PERM) {
                // Check whether we have already seen this obj.id in the wealth log
                let alreadyPresent = false;
                for (let i = 0; i < wealthLog.length; i++) {
                    if (wealthLog[i].id === obj.id) {
                        // If we've seen it, increase the count
                        wealthLog[i].count += obj.count;
                        alreadyPresent = true;
                        break;
                    }
                }
                if (!alreadyPresent) {
                    // Otherwise, create a new entry
                    wealthLog.push({ id: obj.id, count: obj.count, debugname: objType.debugname, baseCost: objType.cost });
                }
            }

            inventory.delete(slot);

            if (!objType.tradeable) {
                continue; // stop untradables after delete.
            }

            World.addObj(new Obj(position.level, position.x, position.z, EntityLifeCycle.DESPAWN, obj.id, obj.count), Obj.NO_RECEIVER, duration);
        }
        for (const toLog of wealthLog) {
            // Log all wealth events
            const totalValueGp = toLog.baseCost * toLog.count;
            player.addWealthLog(-totalValueGp, `Dropped ${toLog.debugname} x${toLog.count}`);
        }
    },

    [ScriptOpcode.INV_TOTALPARAM]: state => {
        const [inv, param] = state.popInts(2);

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invTotalParam(inv, param));
    },

    [ScriptOpcode.INV_TOTALPARAM_STACK]: state => {
        const [inv, param] = state.popInts(2);

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).invTotalParamStack(inv, param));
    }
};

export default InvOps;
