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

        const resumedScript = player.suspendedScript;
        if (resumedScript?.execution === ScriptState.PAUSEBUTTON) {
            player.suspendedScript = null;
            player.lastCom = comId;
            ScriptRunner.execute(resumedScript);

            if (player.modalChat !== -1 && player.suspendedScript?.execution !== ScriptState.PAUSEBUTTON) {
                player.closeModal();
            }
        }

        return true;
    }
}
