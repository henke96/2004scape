import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ResumePauseButton from '#/network/client/model/ResumePauseButton.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';

export default class ResumePauseButtonHandler extends MessageHandler<ResumePauseButton> {
    handle(_message: ResumePauseButton, player: Player): boolean {
        const activeScript = player.activeScript;
        if (!activeScript || activeScript.execution !== ScriptState.PAUSEBUTTON) {
            return false;
        }

        player.closeModal(); // will clear player's active script
        ScriptRunner.execute(activeScript);
        return true;
    }
}
