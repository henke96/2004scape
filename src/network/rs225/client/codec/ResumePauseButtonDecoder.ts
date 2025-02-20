import MessageDecoder from '#/network/client/codec/MessageDecoder.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';
import ResumePauseButton from '#/network/client/model/ResumePauseButton.js';
import Packet from '#/io/Packet.js';

export default class ResumePauseButtonDecoder extends MessageDecoder<ResumePauseButton> {
    prot = ClientProt.RESUME_PAUSEBUTTON;

    decode(buf: Packet) {
        const component: number = buf.g2();
        return new ResumePauseButton(component);
    }
}
