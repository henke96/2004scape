import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ResumePCountDialog from '#/network/client/model/ResumePCountDialog.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';

export default class ResumePCountDialogHandler extends MessageHandler<ResumePCountDialog> {
    handle(message: ResumePCountDialog, player: Player): boolean {
        const { input } = message;

        const resumedScript = player.suspendedScript;
        if (resumedScript?.execution !== ScriptState.COUNTDIALOG) {
            return false;
        }

        resumedScript.lastInt = input;
        ScriptRunner.execute(resumedScript);
        return true;
    }
}
