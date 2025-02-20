import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import InvButtonD from '#/network/client/model/InvButtonD.js';
import Component from '#/cache/config/Component.js';
import Environment from '#/util/Environment.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ScriptState from '#/engine/script/ScriptState.js';

export default class InvButtonDHandler extends MessageHandler<InvButtonD> {
    handle(message: InvButtonD, player: Player): boolean {
        // jagex has if_buttond
        const { component: comId, slot, targetSlot } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            return false;
        }

        const listener = player.invListeners.find(l => l.com === comId);
        if (!listener) {
            return false;
        }

        const inv = player.getInventoryFromListener(listener);
        if (!inv || !inv.validSlot(slot) || !inv.get(slot) || !inv.validSlot(targetSlot)) {
            return false;
        }

        const dragTrigger = ScriptProvider.getByTrigger(ServerTriggerType.INV_BUTTOND, comId);
        if (dragTrigger) {
            const root = Component.get(com.rootLayer);

            const protect = root.overlay == false;

            // osrs inv dragging cancels dialogs (e.g. bank dragging)
            if (protect && player.suspendedScript?.execution === ScriptState.COUNTDIALOG) {
                player.cancelSuspendedScript();
            }
            if (protect && player.protectedAccessScript !== null) {
                // osrs doesn't send partial inv update here
                // Tested by equipping mind shield in equipment stats modal inside
                // barbarian assualt (where it still calls p_delay), then swapping
                // inventory items next tick. Result is an out of sync inventory.
                return false;
            }

            player.lastSlot = slot;
            player.lastTargetSlot = targetSlot;
            player.executeScript(ScriptRunner.init(dragTrigger, player), protect);
        } else if (Environment.NODE_DEBUG) {
            player.messageGame(`No trigger for [inv_buttond,${com.comName}]`);
        }

        return true;
    }
}
