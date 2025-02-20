import IdkType from '#/cache/config/IdkType.js';
import SpotanimType from '#/cache/config/SpotanimType.js';
import NpcType from '#/cache/config/NpcType.js';
import LocType from '#/cache/config/LocType.js';
import ObjType from '#/cache/config/ObjType.js';

import World from '#/engine/World.js';

import ScriptOpcode from '#/engine/script/ScriptOpcode.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import { CommandHandlers } from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';

import { PlayerQueueType, ScriptArgument } from '#/engine/entity/EntityQueueRequest.js';
import { PlayerTimerType } from '#/engine/entity/EntityTimer.js';
import { isBufferFull } from '#/engine/entity/NetworkPlayer.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import CameraInfo from '#/engine/entity/CameraInfo.js';
import Interaction from '#/engine/entity/Interaction.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import Player from '#/engine/entity/Player.js';

import ServerProt from '#/network/rs225/server/prot/ServerProt.js';
import CamShake from '#/network/server/model/CamShake.js';
import CamReset from '#/network/server/model/CamReset.js';
import PCountDialog from '#/network/server/model/PCountDialog.js';
import SynthSound from '#/network/server/model/SynthSound.js';
import IfSetColour from '#/network/server/model/IfSetColour.js';
import IfSetHide from '#/network/server/model/IfSetHide.js';
import IfSetObject from '#/network/server/model/IfSetObject.js';
import IfSetTabActive from '#/network/server/model/IfSetTabActive.js';
import IfSetModel from '#/network/server/model/IfSetModel.js';
import IfSetRecol from '#/network/server/model/IfSetRecol.js';
import TutFlash from '#/network/server/model/TutFlash.js';
import IfSetAnim from '#/network/server/model/IfSetAnim.js';
import IfSetPlayerHead from '#/network/server/model/IfSetPlayerHead.js';
import IfSetText from '#/network/server/model/IfSetText.js';
import IfSetNpcHead from '#/network/server/model/IfSetNpcHead.js';
import IfSetPosition from '#/network/server/model/IfSetPosition.js';

import ColorConversion from '#/util/ColorConversion.js';

import { findPath } from '#/engine/GameMap.js';

import {
    check,
    CoordValid,
    HitTypeValid,
    IDKTypeValid,
    InvTypeValid,
    NpcTypeValid,
    NumberNotNull,
    ObjTypeValid,
    PlayerStatValid,
    SeqTypeValid,
    SpotAnimTypeValid,
    StringNotNull,
    GenderValid,
    SkinColourValid,
    protectedAccessHandler
} from '#/engine/script/ScriptValidators.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';


const PlayerOps: CommandHandlers = {
    [ScriptOpcode.FINDUID]: state => {
        const uid = state.popInt();
        const player = World.getPlayerByUid(uid);

        if (!player) {
            state.pushInt(0);
            return;
        }

        const primary = state.intOperand === 0;
        state.setActivePlayer(primary, player);
        state.pushInt(1);
    },

    // https://x.com/JagexAsh/status/1652956821798223873
    [ScriptOpcode.P_FINDUID]: state => {
        const uid = state.popInt() >>> 0;
        const player = World.getPlayerByUid(uid);

        const primary = state.intOperand === 0;
        const activePlayer = state.activePlayerOrNull(primary);
        if (activePlayer?.uid === uid && activePlayer.protectedAccessScript === state) {
            // script already has protected access of this player, no-op
            state.pushInt(1);
            return;
        }

        if (!player || !player.canAccess()) {
            state.pushInt(0);
            return;
        }

        state.setActivePlayer(primary, player);
        player.protectedAccessScript = state;
        state.pushInt(1);
    },

    // https://x.com/JagexAsh/status/1698973910048403797
    [ScriptOpcode.STRONGQUEUE]: state => {
        const args = popScriptArgs(state);
        const delay = check(state.popInt(), NumberNotNull);
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        const primary = state.intOperand === 0;
        state.activePlayer(primary).enqueueScript(script, PlayerQueueType.STRONG, delay, args);
    },

    // https://x.com/JagexAsh/status/1698973910048403797
    [ScriptOpcode.WEAKQUEUE]: state => {
        const args = popScriptArgs(state);
        const delay = check(state.popInt(), NumberNotNull);
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        const primary = state.intOperand === 0;
        state.activePlayer(primary).enqueueScript(script, PlayerQueueType.WEAK, delay, args);
    },

    // https://x.com/JagexAsh/status/1698973910048403797
    // https://x.com/JagexAsh/status/1821831590906859683
    [ScriptOpcode.QUEUE]: state => {
        const args = popScriptArgs(state);
        const delay = check(state.popInt(), NumberNotNull);
        const scriptId = state.popInt();

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }
        const primary = state.intOperand === 0;
        state.activePlayer(primary).enqueueScript(script, PlayerQueueType.NORMAL, delay, args);
    },

    [ScriptOpcode.LONGQUEUE]: state => {
        const args = popScriptArgs(state);
        const [scriptId, delay, logoutAction] = state.popInts(3);

        const script = ScriptProvider.get(scriptId);
        if (!script) {
            throw new Error(`Unable to find queue script: ${scriptId}`);
        }

        const primary = state.intOperand === 0;
        state.activePlayer(primary).enqueueScript(script, PlayerQueueType.LONG, delay, [logoutAction, ...args]);
    },

    // https://x.com/JagexAsh/status/1806246992797921391
    [ScriptOpcode.ANIM]: state => {
        const delay = state.popInt();
        const seq = state.popInt();

        const primary = state.intOperand === 0;
        state.activePlayer(primary).playAnimation(seq, delay);
    },

    // https://x.com/JagexAsh/status/1694990340669747261
    // soft-limit for developers to be better aware of the bandwidth used and mitigate the impact on the player experience
    [ScriptOpcode.BUFFER_FULL]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(isBufferFull(state.activePlayer(primary)) ? 1 : 0);
    },

    [ScriptOpcode.BUILDAPPEARANCE]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).buildAppearance(check(state.popInt(), InvTypeValid).id);
    },

    [ScriptOpcode.CAM_LOOKAT]: state => {
        const [coord, height, rotationSpeed, rotationMultiplier] = state.popInts(4);

        const pos: CoordGrid = check(coord, CoordValid);
        const primary = state.intOperand === 0;
        state.activePlayer(primary).cameraPackets.addTail(new CameraInfo(ServerProt.CAM_LOOKAT, pos.x, pos.z, height, rotationSpeed, rotationMultiplier));
    },

    [ScriptOpcode.CAM_MOVETO]: state => {
        const [coord, height, rotationSpeed, rotationMultiplier] = state.popInts(4);

        const pos: CoordGrid = check(coord, CoordValid);
        const primary = state.intOperand === 0;
        state.activePlayer(primary).cameraPackets.addTail(new CameraInfo(ServerProt.CAM_MOVETO, pos.x, pos.z, height, rotationSpeed, rotationMultiplier));
    },

    [ScriptOpcode.CAM_SHAKE]: state => {
        const [type, jitter, amplitude, frequency] = state.popInts(4);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new CamShake(type, jitter, amplitude, frequency));
    },

    [ScriptOpcode.CAM_RESET]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new CamReset());
    },

    [ScriptOpcode.COORD]: state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);
        state.pushInt(CoordGrid.packCoord(player.level, player.x, player.z));
    },

    [ScriptOpcode.DISPLAYNAME]: state => {
        const primary = state.intOperand === 0;
        state.pushString(state.activePlayer(primary).displayName);
    },

    [ScriptOpcode.FACESQUARE]: state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).faceSquare(coord.x, coord.z);
    },

    [ScriptOpcode.IF_CLOSE]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).closeModal();
    },

    [ScriptOpcode.LAST_COM]: state => {
        state.pushInt(state.activePlayer(true).lastCom);
    },

    // https://x.com/JagexAsh/status/1782377050021523947
    // todo: move out of PlayerOps
    [ScriptOpcode.LAST_INT]: state => {
        state.pushInt(state.lastInt);
    },

    [ScriptOpcode.LAST_ITEM]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELD1,
            ServerTriggerType.OPHELD2,
            ServerTriggerType.OPHELD3,
            ServerTriggerType.OPHELD4,
            ServerTriggerType.OPHELD5,
            ServerTriggerType.OPHELDU,
            ServerTriggerType.OPHELDT,
            ServerTriggerType.INV_BUTTON1,
            ServerTriggerType.INV_BUTTON2,
            ServerTriggerType.INV_BUTTON3,
            ServerTriggerType.INV_BUTTON4,
            ServerTriggerType.INV_BUTTON5
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer(true).lastItem);
    },

    [ScriptOpcode.LAST_SLOT]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELD1,
            ServerTriggerType.OPHELD2,
            ServerTriggerType.OPHELD3,
            ServerTriggerType.OPHELD4,
            ServerTriggerType.OPHELD5,
            ServerTriggerType.OPHELDU,
            ServerTriggerType.OPHELDT,
            ServerTriggerType.INV_BUTTON1,
            ServerTriggerType.INV_BUTTON2,
            ServerTriggerType.INV_BUTTON3,
            ServerTriggerType.INV_BUTTON4,
            ServerTriggerType.INV_BUTTON5,
            ServerTriggerType.INV_BUTTOND
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer(true).lastSlot);
    },

    [ScriptOpcode.LAST_USEITEM]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELDU,
            ServerTriggerType.APOBJU,
            ServerTriggerType.APLOCU,
            ServerTriggerType.APNPCU,
            ServerTriggerType.APPLAYERU,
            ServerTriggerType.OPOBJU,
            ServerTriggerType.OPLOCU,
            ServerTriggerType.OPNPCU,
            ServerTriggerType.OPPLAYERU
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer(true).lastUseItem);
    },

    [ScriptOpcode.LAST_USESLOT]: state => {
        const allowedTriggers = [
            ServerTriggerType.OPHELDU,
            ServerTriggerType.APOBJU,
            ServerTriggerType.APLOCU,
            ServerTriggerType.APNPCU,
            ServerTriggerType.APPLAYERU,
            ServerTriggerType.OPOBJU,
            ServerTriggerType.OPLOCU,
            ServerTriggerType.OPNPCU,
            ServerTriggerType.OPPLAYERU
        ];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer(true).lastUseSlot);
    },

    [ScriptOpcode.MES]: state => {
        const message = state.popString();

        const primary = state.intOperand === 0;
        state.activePlayer(primary).messageGame(message);
    },

    [ScriptOpcode.NAME]: state => {
        const primary = state.intOperand === 0;
        state.pushString(state.activePlayer(primary).username);
    },

    [ScriptOpcode.P_APRANGE]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        player.apRange = check(state.popInt(), NumberNotNull);
        player.apRangeCalled = true;
    }),

    // https://x.com/JagexAsh/status/1648254846686904321
    [ScriptOpcode.P_ARRIVEDELAY]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        if (player.lastMovement < World.currentTick) {
            return;
        }

        player.suspendedScript = state;
        player.delayedUntil = World.currentTick + 1;
        state.execution = ScriptState.DELAYED;
        state.corruptProtectedAccess(!primary);
    }),

    [ScriptOpcode.P_COUNTDIALOG]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        player.write(new PCountDialog());
        player.suspendedScript = state;
        state.execution = ScriptState.COUNTDIALOG;
        state.corruptProtectedAccess(!primary);
    }),

    // https://x.com/JagexAsh/status/1684478874703343616
    // https://x.com/JagexAsh/status/1780932943038345562
    [ScriptOpcode.P_DELAY]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        player.delayedUntil = World.currentTick + 1 + check(state.popInt(), NumberNotNull);
        player.suspendedScript = state;
        state.execution = ScriptState.DELAYED;
        state.corruptProtectedAccess(!primary);
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPLOC]: protectedAccessHandler(state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid oploc: ${type + 1}`);
        }

        const loc = state.activeLoc(true);
        const locType: LocType = LocType.get(loc.type);
        if (!locType.op || !locType.op[type]) {
            return;
        }

        const player = state.activePlayer(true);
        player.stopAction();
        if (!player.inOperableDistance(loc)) {
            player.queueWaypoint(loc.x, loc.z);
        }
        player.setInteraction(Interaction.SCRIPT, loc, ServerTriggerType.APLOC1 + type);
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPNPC]: protectedAccessHandler(state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opnpc: ${type + 1}`);
        }

        const npc = state.activeNpc(true);
        const npcType: NpcType = NpcType.get(npc.type);
        if (!npcType.op || !npcType.op[type]) {
            return;
        }

        const player = state.activePlayer(true);
        player.stopAction();
        player.setInteraction(Interaction.SCRIPT, npc, ServerTriggerType.APNPC1 + type, { type: npc.type, com: -1 });
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPNPCT]: protectedAccessHandler(state => {
        const spellId: number = check(state.popInt(), NumberNotNull);

        const npc = state.activeNpc(true);
        const player = state.activePlayer(true);
        player.stopAction();
        player.setInteraction(Interaction.SCRIPT, npc, ServerTriggerType.APNPCT, { type: npc.type, com: spellId });
    }),

    // https://x.com/JagexAsh/status/1389465615631519744
    [ScriptOpcode.P_PAUSEBUTTON]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).suspendedScript = state;
        state.execution = ScriptState.PAUSEBUTTON;
        state.corruptProtectedAccess(!primary);
    }),

    // https://x.com/JagexAsh/status/1780904271610867780
    [ScriptOpcode.P_STOPACTION]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).stopAction();
    }),

    // https://x.com/JagexAsh/status/1780230057023181259
    [ScriptOpcode.P_CLEARPENDINGACTION]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).clearPendingAction();
    }),

    // https://x.com/JagexAsh/status/1697517518007541917
    [ScriptOpcode.P_TELEJUMP]: protectedAccessHandler(state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).teleJump(coord.x, coord.z, coord.level);
    }),

    // https://x.com/JagexAsh/status/1697517518007541917
    // https://x.com/JagexAsh/status/1790684996480442796
    [ScriptOpcode.P_TELEPORT]: protectedAccessHandler(state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).teleport(coord.x, coord.z, coord.level);
    }),

    // https://x.com/JagexAsh/status/1605130887292751873
    // https://x.com/JagexAsh/status/1698248664349614138
    [ScriptOpcode.P_WALK]: protectedAccessHandler(state => {
        const coord: CoordGrid = check(state.popInt(), CoordValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);
        player.queueWaypoints(findPath(player.level, player.x, player.z, coord.x, coord.z));
    }),

    [ScriptOpcode.SAY]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).say(state.popString());
    },

    [ScriptOpcode.SOUND_SYNTH]: state => {
        const [synth, loops, delay] = state.popInts(3);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new SynthSound(synth, loops, delay));
    },

    [ScriptOpcode.STAFFMODLEVEL]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).staffModLevel);
    },

    [ScriptOpcode.STAT]: state => {
        const stat: PlayerStat = check(state.popInt(), PlayerStatValid);

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).levels[stat]);
    },

    [ScriptOpcode.STAT_BASE]: state => {
        const stat: PlayerStat = check(state.popInt(), PlayerStatValid);

        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).baseLevels[stat]);
    },

    [ScriptOpcode.STAT_ADD]: state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        const current = player.levels[stat];
        const added = current + (constant + (current * percent) / 100);
        player.levels[stat] = Math.min(added, 255);
        if (stat === 3 && player.levels[3] >= player.baseLevels[3]) {
            player.heroPoints.clear();
        }
        if (added !== current) {
            player.changeStat(stat);
        }
    },

    [ScriptOpcode.STAT_SUB]: state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        const current = player.levels[stat];
        const subbed = current - (constant + (current * percent) / 100);
        player.levels[stat] = Math.max(subbed, 0);
        if (subbed !== current) {
            player.changeStat(stat);
        }
    },

    [ScriptOpcode.SPOTANIM_PL]: state => {
        const delay = check(state.popInt(), NumberNotNull);
        const height = state.popInt();
        const spotanimType: SpotanimType = check(state.popInt(), SpotAnimTypeValid);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).spotanim(spotanimType.id, height, delay);
    },

    [ScriptOpcode.STAT_HEAL]: state => {
        const [stat, constant, percent] = state.popInts(3);

        check(stat, PlayerStatValid);
        check(constant, NumberNotNull);
        check(percent, NumberNotNull);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        const base = player.baseLevels[stat];
        const current = player.levels[stat];
        const healed = current + (constant + (current * percent) / 100);
        player.levels[stat] = Math.max(Math.min(healed, base), current);

        if (stat === 3 && player.levels[3] >= player.baseLevels[3]) {
            player.heroPoints.clear();
        }

        if (healed !== current) {
            player.changeStat(stat);
        }
    },

    [ScriptOpcode.UID]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).uid);
    },

    [ScriptOpcode.P_LOGOUT]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).requestLogout = true;
    }),

    [ScriptOpcode.P_PREVENTLOGOUT]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        // a short antilog can overwrite a long one in osrs, so no checks here
        player.preventLogoutMessage = check(state.popString(), StringNotNull);
        player.preventLogoutUntil = World.currentTick + check(state.popInt(), NumberNotNull);
    }),

    [ScriptOpcode.IF_SETCOLOUR]: state => {
        const [com, colour] = state.popInts(2);

        check(com, NumberNotNull);
        check(colour, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetColour(com, ColorConversion.rgb24to15(colour)));
    },

    [ScriptOpcode.IF_OPENCHAT]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).openChat(check(state.popInt(), NumberNotNull));
    },

    [ScriptOpcode.IF_OPENMAIN_SIDE]: state => {
        const [main, side] = state.popInts(2);

        check(main, NumberNotNull);
        check(side, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).openMainModalSide(main, side);
    },

    [ScriptOpcode.IF_SETHIDE]: state => {
        const [com, hide] = state.popInts(2);

        check(com, NumberNotNull);
        check(hide, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetHide(com, hide === 1));
    },

    [ScriptOpcode.IF_SETOBJECT]: state => {
        const [com, obj, scale] = state.popInts(3);

        check(com, NumberNotNull);
        check(obj, ObjTypeValid);
        check(scale, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetObject(com, obj, scale));
    },

    [ScriptOpcode.IF_SETTABACTIVE]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetTabActive(check(state.popInt(), NumberNotNull)));
    },

    [ScriptOpcode.IF_SETMODEL]: state => {
        const [com, model] = state.popInts(2);

        check(com, NumberNotNull);
        check(model, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetModel(com, model));
    },

    [ScriptOpcode.IF_SETRECOL]: state => {
        const [com, src, dest] = state.popInts(3);

        check(com, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetRecol(com, src, dest));
    },

    [ScriptOpcode.TUT_FLASH]: state => {
        state.activePlayer(true).write(new TutFlash(check(state.popInt(), NumberNotNull)));
    },

    [ScriptOpcode.IF_SETANIM]: state => {
        const [com, seq] = state.popInts(2);

        check(com, NumberNotNull);

        if (seq === -1) {
            // uh, client crashes! which means empty dialogue wasn't an option at the time
            return;
        }

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetAnim(com, seq));
    },

    [ScriptOpcode.IF_SETTAB]: state => {
        const [com, tab] = state.popInts(2);

        check(tab, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).setTab(com, tab);
    },

    [ScriptOpcode.IF_OPENMAIN]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).openMainModal(check(state.popInt(), NumberNotNull));
    },

    [ScriptOpcode.TUT_OPEN]: state => {
        state.activePlayer(true).openTutorial(check(state.popInt(), NumberNotNull));
    },

    [ScriptOpcode.IF_OPENSIDE]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).openSideModal(check(state.popInt(), NumberNotNull));
    },

    [ScriptOpcode.IF_SETPLAYERHEAD]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetPlayerHead(check(state.popInt(), NumberNotNull)));
    },

    [ScriptOpcode.IF_SETTEXT]: state => {
        const text = state.popString();
        const com = check(state.popInt(), NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetText(com, text));
    },

    [ScriptOpcode.IF_SETNPCHEAD]: state => {
        const [com, npc] = state.popInts(2);

        check(com, NumberNotNull);
        check(npc, NpcTypeValid);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetNpcHead(com, npc));
    },

    [ScriptOpcode.IF_SETPOSITION]: state => {
        const [com, x, y] = state.popInts(3);

        check(com, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).write(new IfSetPosition(com, x, y));
    },

    [ScriptOpcode.STAT_ADVANCE]: state => {
        const [stat, xp] = state.popInts(2);

        check(stat, NumberNotNull);
        check(xp, NumberNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).addXp(stat, xp);
    },

    [ScriptOpcode.DAMAGE]: state => {
        const amount = check(state.popInt(), NumberNotNull);
        const type = check(state.popInt(), HitTypeValid);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).applyDamage(amount, type);
    },

    [ScriptOpcode.IF_SETRESUMEBUTTONS]: state => {
        const [button1, button2, button3, button4, button5] = state.popInts(5);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).resumeButtons = [button1, button2, button3, button4, button5];
    },

    [ScriptOpcode.TEXT_GENDER]: state => {
        const [male, female] = state.popStrings(2);

        const primary = state.intOperand === 0;
        if (state.activePlayer(primary).gender === 0) {
            state.pushString(male);
        } else {
            state.pushString(female);
        }
    },

    [ScriptOpcode.MIDI_SONG]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).playSong(check(state.popString(), StringNotNull));
    },

    [ScriptOpcode.MIDI_JINGLE]: state => {
        const delay = check(state.popInt(), NumberNotNull);
        const name = check(state.popString(), StringNotNull);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).playJingle(delay, name);
    },

    [ScriptOpcode.SOFTTIMER]: state => {
        const args = popScriptArgs(state);
        const interval = state.popInt();
        const timerId = state.popInt();

        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }

        const primary = state.intOperand === 0;
        state.activePlayer(primary).setTimer(PlayerTimerType.SOFT, script, args, interval);
    },

    [ScriptOpcode.CLEARSOFTTIMER]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).clearTimer(state.popInt());
    },

    [ScriptOpcode.SETTIMER]: state => {
        const args = popScriptArgs(state);
        const interval = state.popInt();
        const timerId = state.popInt();

        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }

        const primary = state.intOperand === 0;
        state.activePlayer(primary).setTimer(PlayerTimerType.NORMAL, script, args, interval);
    },

    [ScriptOpcode.CLEARTIMER]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).clearTimer(state.popInt());
    },

    [ScriptOpcode.GETTIMER]: state => {
        const timerId = state.popInt();
        const script = ScriptProvider.get(timerId);
        if (!script) {
            throw new Error(`Unable to find timer script: ${timerId}`);
        }

        const primary = state.intOperand === 0;
        for (const timer of state.activePlayer(primary).timers.values()) {
            if (timer.script.id === timerId) {
                state.pushInt(timer.clock);
                return;
            }
        }

        state.pushInt(-1);
    },

    [ScriptOpcode.HINT_COORD]: state => {
        const [offset, coord, height] = state.popInts(3);

        const position: CoordGrid = check(coord, CoordValid);
        const primary = state.intOperand === 0;
        state.activePlayer(primary).hintTile(offset, position.x, position.z, height);
    },

    [ScriptOpcode.HINT_STOP]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).stopHint();
    },

    [ScriptOpcode.TUT_CLOSE]: state => {
        state.activePlayer(true).closeTutorial();
    },

    // https://x.com/JagexAsh/status/1684174294086033410
    [ScriptOpcode.P_EXACTMOVE]: protectedAccessHandler(state => {
        const [start, end, startCycle, endCycle, direction] = state.popInts(5);

        const startPos: CoordGrid = check(start, CoordValid);
        const endPos: CoordGrid = check(end, CoordValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        player.unsetMapFlag();
        player.exactMove(startPos.x, startPos.z, endPos.x, endPos.z, startCycle, endCycle, direction);
    }),

    // https://x.com/JagexAsh/status/1653407769989349377
    [ScriptOpcode.BUSY]: state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        state.pushInt(!player.canAccess() || player.loggingOut ? 1 : 0);
    },

    // https://x.com/JagexAsh/status/1791053667228856563
    [ScriptOpcode.BUSY2]: state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        state.pushInt(player.hasInteraction() || player.hasWaypoints() ? 1 : 0);
    },

    // https://x.com/JagexAsh/status/1821831590906859683
    [ScriptOpcode.GETQUEUE]: state => {
        const scriptId = state.popInt();

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        let count: number = 0;
        for (let request = player.queue.head(); request !== null; request = player.queue.next()) {
            if (request.script.id === scriptId) {
                count++;
            }
        }
        for (let request = player.weakQueue.head(); request !== null; request = player.weakQueue.next()) {
            if (request.script.id === scriptId) {
                count++;
            }
        }
        state.pushInt(count);
    },

    // https://x.com/JagexAsh/status/1684232225397657602
    [ScriptOpcode.P_LOCMERGE]: protectedAccessHandler(state => {
        const [startCycle, endCycle, southEast, northWest] = state.popInts(4);

        const se: CoordGrid = check(southEast, CoordValid);
        const nw: CoordGrid = check(northWest, CoordValid);

        const primary = state.intOperand === 0;
        World.mergeLoc(state.activeLoc(true), state.activePlayer(primary), startCycle, endCycle, se.z, se.x, nw.z, nw.x);
    }),

    [ScriptOpcode.LAST_LOGIN_INFO]: state => {
        // proxying websockets through cf may show IPv6 and breaks anyways
        // so we just hardcode 127.0.0.1 (2130706433)

        state.activePlayer(true).lastLoginInfo(2130706433, 0, 201, 0);
    },

    [ScriptOpcode.BAS_READYANIM]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).basReadyAnim = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_TURNONSPOT]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).basTurnOnSpot = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_F]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).basWalkForward = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_B]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).basWalkBackward = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_L]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).basWalkLeft = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_WALK_R]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).basWalkRight = check(state.popInt(), SeqTypeValid).id;
    },

    [ScriptOpcode.BAS_RUNNING]: state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        const seq = state.popInt();
        if (seq === -1) {
            player.basRunning = -1;
            return;
        }
        player.basRunning = check(seq, SeqTypeValid).id;
    },

    [ScriptOpcode.GENDER]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).gender);
    },

    [ScriptOpcode.HINT_NPC]: state => {
        state.activePlayer(true).hintNpc(state.activeNpc(true).nid);
    },

    [ScriptOpcode.HINT_PLAYER]: state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);
        const target = state.activePlayer(!primary);

        player.hintPlayer(target.pid);
    },

    [ScriptOpcode.HEADICONS_GET]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).headicons);
    },

    [ScriptOpcode.HEADICONS_SET]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).headicons = check(state.popInt(), NumberNotNull);
    },

    // https://x.com/JagexAsh/status/1791472651623370843
    // https://x.com/JagexAsh/status/1790684996480442796
    [ScriptOpcode.P_OPOBJ]: protectedAccessHandler(state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opobj: ${type + 1}`);
        }
        const obj = state.activeObj(true);
        const objType: ObjType = ObjType.get(obj.type);
        if (!objType.op || !objType.op[type]) {
            return;
        }

        const player = state.activePlayer(true);
        player.stopAction();
        // Sets player destination naively to the Obj's coordinate
        player.queueWaypoint(obj.x, obj.z);
        player.setInteraction(Interaction.SCRIPT, obj, ServerTriggerType.APOBJ1 + type);
    }),

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPPLAYER]: protectedAccessHandler(state => {
        const type = check(state.popInt(), NumberNotNull) - 1;
        if (type < 0 || type >= 5) {
            throw new Error(`Invalid opplayer: ${type + 1}`);
        }

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);
        const target = state.activePlayer(!primary);

        player.stopAction();
        player.setInteraction(Interaction.SCRIPT, target, ServerTriggerType.APPLAYER1 + type);
    }),

    [ScriptOpcode.ALLOWDESIGN]: state => {
        state.activePlayer(true).allowDesign = check(state.popInt(), NumberNotNull) === 1;
    },

    [ScriptOpcode.LAST_TARGETSLOT]: state => {
        const allowedTriggers = [ServerTriggerType.INV_BUTTOND];
        if (!allowedTriggers.includes(state.trigger)) {
            throw new Error('is not safe to use in this trigger');
        }

        state.pushInt(state.activePlayer(true).lastTargetSlot);
    },

    [ScriptOpcode.WALKTRIGGER]: state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).walktrigger = state.popInt();
    },

    // https://x.com/JagexAsh/status/1779778790593372205
    [ScriptOpcode.GETWALKTRIGGER]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).walktrigger);
    },

    // https://x.com/JagexAsh/status/1821831590906859683
    [ScriptOpcode.CLEARQUEUE]: state => {
        const scriptId = state.popInt();

        const primary = state.intOperand === 0;
        state.activePlayer(primary).unlinkQueuedScript(scriptId);
    },

    [ScriptOpcode.HEALENERGY]: state => {
        const amount = check(state.popInt(), NumberNotNull); // 100=1%, 1000=10%, 10000=100%

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);
        player.runenergy = Math.min(Math.max(player.runenergy + amount, 0), 10000);
    },

    [ScriptOpcode.AFK_EVENT]: state => {
        const player = state.activePlayer(true);
        state.pushInt(player.afkEventReady ? 1 : 0);
        player.afkEventReady = false;
    },

    [ScriptOpcode.LOWMEMORY]: state => {
        state.pushInt(state.activePlayer(true).lowMemory ? 1 : 0);
    },

    [ScriptOpcode.SETIDKIT]: state => {
        const [idkit, color] = state.popInts(2);

        const idkType: IdkType = check(idkit, IDKTypeValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        let slot = idkType.type;
        if (player.gender === 1) {
            slot -= 7;
        }
        player.body[slot] = idkType.id;

        // 0 - hair/jaw
        // 1 - torso
        // 2 - legs
        // 3 - boots
        // 4 - skin
        let type = idkType.type;
        if (player.gender === 1) {
            type -= 7;
        }
        let colorSlot = -1;
        if (type === 0 || type === 1) {
            colorSlot = 0;
        } else if (type === 2 || type === 3) {
            colorSlot = 1;
        } else if (type === 4) {
            /* no-op (no hand recoloring) */
        } else if (type === 5) {
            colorSlot = 2;
        } else if (type === 6) {
            colorSlot = 3;
        }

        if (colorSlot !== -1) {
            player.colors[colorSlot] = color;
        }
    },

    [ScriptOpcode.SETGENDER]: state => {
        const gender = check(state.popInt(), GenderValid);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        // convert idkit, have to use a mapping cause order + there's not always an equivalence
        for (let i = 0; i < 7; i++) {
            if (gender === 1) {
                player.body[i] = Player.MALE_FEMALE_MAP.get(player.body[i]) ?? -1;
            } else {
                if (i == 1) {
                    player.body[i] = 14;
                    continue;
                }
                player.body[i] = Player.FEMALE_MALE_MAP.get(player.body[i]) ?? -1;
            }
        }
        player.gender = gender;
    },

    [ScriptOpcode.SETSKINCOLOUR]: state => {
        const skin = check(state.popInt(), SkinColourValid);

        const primary = state.intOperand === 0;
        state.activePlayer(primary).colors[4] = skin;
    },

    // https://x.com/JagexAsh/status/1791472651623370843
    [ScriptOpcode.P_OPPLAYERT]: protectedAccessHandler(state => {
        const spellId = check(state.popInt(), NumberNotNull);

        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);
        const target = state.activePlayer(!primary);

        player.stopAction();
        player.setInteraction(Interaction.SCRIPT, target, ServerTriggerType.APPLAYERT, { type: -1, com: spellId });
    }),

    // https://x.com/JagexAsh/status/1799020087086903511
    [ScriptOpcode.FINDHERO]: state => {
        const primary = state.intOperand === 0;
        const uid = state.activePlayer(primary).heroPoints.findHero();
        if (uid === -1) {
            state.pushInt(0);
            return;
        }

        const player = World.getPlayerByUid(uid);
        if (!player) {
            state.pushInt(0);
            return;
        }
        state.setActivePlayer(!primary, player);
        state.pushInt(1);
    },

    // https://x.com/JagexAsh/status/1799020087086903511
    [ScriptOpcode.BOTH_HEROPOINTS]: state => {
        const damage: number = check(state.popInt(), NumberNotNull);

        const primary = state.intOperand === 0;
        const fromPlayer = state.activePlayer(primary);
        const toPlayer = state.activePlayer(!primary);

        toPlayer.heroPoints.addHero(fromPlayer.uid, damage);
    },

    // https://x.com/JagexAsh/status/1806246992797921391
    [ScriptOpcode.P_ANIMPROTECT]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        state.activePlayer(primary).animProtect = check(state.popInt(), NumberNotNull);
    }),

    [ScriptOpcode.RUNENERGY]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).runenergy);
    },

    [ScriptOpcode.WEIGHT]: state => {
        const primary = state.intOperand === 0;
        state.pushInt(state.activePlayer(primary).runweight);
    },

    [ScriptOpcode.SESSION_LOG]: state => {
        const eventType = state.popInt() + 2;
        const event = state.popString();

        state.activePlayer(true).addSessionLog(eventType, event);
    },

    [ScriptOpcode.WEALTH_LOG]: state => {
        const [isGained, amount] = state.popInts(2);
        const event = state.popString();

        state.activePlayer(true).addWealthLog(isGained ? amount : -amount, event);
    },

    [ScriptOpcode.P_RUN]: protectedAccessHandler(state => {
        const primary = state.intOperand === 0;
        const player = state.activePlayer(primary);

        player.run = state.popInt();
        // todo: better way to sync engine varp
        player.setVar(VarPlayerType.RUN, player.run);
    })
};

/**
 * Pops a dynamic number of arguments intended for other scripts. Top of the stack
 * contains a string with the argument types to pop.
 *
 * @param state The script state.
 */
function popScriptArgs(state: ScriptState): ScriptArgument[] {
    const types = state.popString();
    const count = types.length;

    const args: ScriptArgument[] = [];
    for (let i = count - 1; i >= 0; i--) {
        const type = types.charAt(i);

        if (type === 's') {
            args[i] = state.popString();
        } else {
            args[i] = state.popInt();
        }
    }
    return args;
}

export default PlayerOps;
