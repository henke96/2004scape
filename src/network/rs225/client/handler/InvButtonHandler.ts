import Component from '#/cache/config/Component.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import Player from '#/engine/entity/Player.js';
import InvButton from '#/network/client/model/InvButton.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Environment from '#/util/Environment.js';
import ScriptState from '#/engine/script/ScriptState.js';

export default class InvButtonHandler extends MessageHandler<InvButton> {
    handle(message: InvButton, player: Player): boolean {
        // jagex has if_button1-5
        const { op, obj: item, slot, component: comId } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !com.inventoryOptions || !com.inventoryOptions.length || !player.isComponentVisible(com)) {
            return false;
        }

        if (!com.inventoryOptions[op - 1]) {
            return false;
        }

        const listener = player.invListeners.find(l => l.com === comId);
        if (!listener) {
            return false;
        }

        const inv = player.getInventoryFromListener(listener);
        if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
            return false;
        }

        let trigger: ServerTriggerType;
        if (op === 1) {
            trigger = ServerTriggerType.INV_BUTTON1;
        } else if (op === 2) {
            trigger = ServerTriggerType.INV_BUTTON2;
        } else if (op === 3) {
            trigger = ServerTriggerType.INV_BUTTON3;
        } else if (op === 4) {
            trigger = ServerTriggerType.INV_BUTTON4;
        } else {
            trigger = ServerTriggerType.INV_BUTTON5;
        }

        const script = ScriptProvider.getByTrigger(trigger, comId, -1);
        if (script) {
            const root = Component.get(com.rootLayer);

            const protect = root.overlay == false;

            // osrs inv buttons cancel dialogs (e.g. bank items)
            if (protect && player.suspendedScript?.execution === ScriptState.COUNTDIALOG) {
                player.cancelSuspendedScript();
            }
            if (protect && player.protectedAccessScript !== null) {
                return false;
            }

            player.lastItem = item;
            player.lastSlot = slot;
            player.executeScript(ScriptRunner.init(script, player), protect);
        } else if (Environment.NODE_DEBUG) {
            player.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${com.comName}]`);
        }

        return true;
    }
}
