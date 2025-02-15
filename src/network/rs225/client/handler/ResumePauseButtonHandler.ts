import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ResumePauseButton from '#/network/client/model/ResumePauseButton.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import Component from '#/cache/config/Component.js';

export default class ResumePauseButtonHandler extends MessageHandler<ResumePauseButton> {
    handle(message: ResumePauseButton, player: Player): boolean {
        const { component: comId } = message;
        
        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            return false;
        }

        if (player.activeScript?.execution === ScriptState.PAUSEBUTTON) {
            const modalMain = player.modalMain;
            const modalChat = player.modalChat;
            const modalSide = player.modalSide;

            player.lastCom = comId;
            ScriptRunner.execute(player.activeScript);

            const sameModals = modalMain === player.modalMain && modalChat === player.modalChat && modalSide === player.modalSide;
            if (sameModals && player.activeScript?.execution !== ScriptState.PAUSEBUTTON) {
                player.closeModal();
            }
        }

        return true;
    }
}
