import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import IfButton from '#/network/client/model/IfButton.js';
import Component from '#/cache/config/Component.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import Environment from '#/util/Environment.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ScriptState from '#/engine/script/ScriptState.js';

export default class IfButtonHandler extends MessageHandler<IfButton> {
    handle(message: IfButton, player: Player): boolean {
        const { component: comId } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            return false;
        }

        if (player.resumeButtons.indexOf(comId) !== -1) {
            const resumedScript = player.suspendedScript;
            if (resumedScript?.execution === ScriptState.PAUSEBUTTON) {
                const modalMain = player.modalMain;
                const modalChat = player.modalChat;
                const modalSide = player.modalSide;
    
                player.suspendedScript = null;
                player.lastCom = comId;
                ScriptRunner.execute(resumedScript);
    
                const sameModals = modalMain === player.modalMain && modalChat === player.modalChat && modalSide === player.modalSide;
                if (sameModals && player.suspendedScript?.execution !== ScriptState.PAUSEBUTTON) {
                    player.closeModal();
                }
            }
        } else {
            const root = Component.get(com.rootLayer);

            const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.IF_BUTTON, comId, -1);
            if (script) {
                const protect = root.overlay == false;

                // osrs modal buttons cancel dialogs (e.g. bank buttons)
                if (protect && player.suspendedScript?.execution === ScriptState.COUNTDIALOG) {
                    player.cancelSuspendedScript();
                }
                if (protect && player.protectedAccessScript !== null) {
                    return false;
                }
                player.lastCom = comId;
                player.executeScript(ScriptRunner.init(script, player), protect);
            } else if (Environment.NODE_DEBUG) {
                player.messageGame(`No trigger for [if_button,${com.comName}]`);
            }
        }

        return true;
    }
}
