import DbTableType from '#/cache/config/DbTableType.js';

import ScriptFile from '#/engine/script/ScriptFile.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';

import Entity from '#/engine/entity/Entity.js';
import { ScriptArgument } from '#/engine/entity/EntityQueueRequest.js';
import Loc from '#/engine/entity/Loc.js';
import Obj from '#/engine/entity/Obj.js';
import Npc from '#/engine/entity/Npc.js';
import Player from '#/engine/entity/Player.js';

import { toInt32 } from '#/util/Numbers.js';

export interface GosubStackFrame {
    script: ScriptFile;
    pc: number;
    intLocals: number[];
    stringLocals: string[];
}

// for debugging stack traces
export interface JumpStackFrame {
    script: ScriptFile;
    pc: number;
}

export default class ScriptState {
    static readonly ABORTED = -1;
    static readonly RUNNING = 0;
    static readonly FINISHED = 1;
    static readonly DELAYED = 2;
    static readonly PAUSEBUTTON = 3;
    static readonly COUNTDIALOG = 4;

    // interpreter
    script: ScriptFile;
    trigger: ServerTriggerType;
    execution = ScriptState.RUNNING;
    executionHistory: number[] = [];

    pc = -1; // program counter
    opcount = 0; // number of opcodes executed

    frames: GosubStackFrame[] = [];
    fp = 0; // frame pointer

    debugFrames: JumpStackFrame[] = [];
    debugFp = 0;

    intStack: (number | null)[] = [];
    isp = 0; // int stack pointer

    stringStack: (string | null)[] = [];
    ssp = 0; // string stack pointer

    intLocals: number[] = [];
    stringLocals: string[] = [];

    // server
    /**
     * The primary entity.
     */
    self: Entity | null = null;

    // active entities
    /**
     * The primary active player.
     */
    _activePlayer: Player | null = null;

    /**
     * The secondary active player.
     * @type {Player|null}
     */
    _activePlayer2: Player | null = null;

    /**
     * The primary active npc.
     */
    _activeNpc: Npc | null = null;

    /**
     * The secondary active npc.
     */
    _activeNpc2: Npc | null = null;

    /**
     * The primary active loc.
     */
    _activeLoc: Loc | null = null;

    /**
     * The secondary active loc.
     */
    _activeLoc2: Loc | null = null;

    _activeObj: Obj | null = null;
    _activeObj2: Obj | null = null;

    /**
     * Used for string splitting operations with split_init and related commands.
     */
    splitPages: string[][] = [];
    splitMesanim: number = -1;

    /**
     * Used for db operations with db_find and related commands
     */
    dbTable: DbTableType | null = null;
    dbColumn: number = -1;
    dbRow: number = -1;
    dbRowQuery: number[] = [];

    /**
     * Used for debug commands
     */
    timespent: number = 0;

    huntIterator: IterableIterator<Entity> | null = null;
    npcIterator: IterableIterator<Npc> | null = null;
    locIterator: IterableIterator<Loc> | null = null;

    lastInt: number = 0;

    constructor(script: ScriptFile, args: ScriptArgument[] | null = []) {
        this.script = script;
        this.trigger = script.info.lookupKey & 0xff;

        if (args) {
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];

                if (typeof arg === 'number') {
                    this.intLocals.push(arg);
                } else {
                    this.stringLocals.push(arg);
                }
            }
        }
    }

    activePlayerOrNull(primary: boolean): Player | null {
        return primary ? this._activePlayer : this._activePlayer2;
    }

    activePlayer(primary: boolean): Player {
        const player = this.activePlayerOrNull(primary);
        if (player === null) {
            throw new Error('Attempt to access null active player');
        }
        return player;
    }

    setActivePlayer(primary: boolean, player: Player) {
        if (primary) {
            if (this._activePlayer?.protectedAccessScript === this) {
                this._activePlayer.protectedAccessScript = null;
            }
            this._activePlayer = player;
        } else {
            if (this._activePlayer2?.protectedAccessScript === this) {
                this._activePlayer2.protectedAccessScript = null;
            }
            this._activePlayer2 = player;
        }
    }

    corruptProtectedAccess(primary: boolean) {
        const player = this.activePlayerOrNull(primary);
        if (player?.protectedAccessScript === this) {
            player.protectedAccessScript = null;
        }
    }

    activeNpcOrNull(primary: boolean): Npc | null {
        return primary ? this._activeNpc : this._activeNpc2;
    }

    activeNpc(primary: boolean): Npc {
        const npc = this.activeNpcOrNull(primary);
        if (npc === null) {
            throw new Error('Attempt to access null active npc');
        }
        return npc;
    }

    setActiveNpc(primary: boolean, npc: Npc) {
        if (primary) {
            this._activeNpc = npc;
        } else {
            this._activeNpc2 = npc;
        }
    }

    activeLocOrNull(primary: boolean): Loc | null {
        return primary ? this._activeLoc : this._activeLoc2;
    }

    activeLoc(primary: boolean): Loc {
        const loc = this.activeLocOrNull(primary);
        if (loc === null) {
            throw new Error('Attempt to access null active loc');
        }
        return loc;
    }

    setActiveLoc(primary: boolean, loc: Loc) {
        if (primary) {
            this._activeLoc = loc;
        } else {
            this._activeLoc2 = loc;
        }
    }

    activeObjOrNull(primary: boolean): Obj | null {
        return primary ? this._activeObj : this._activeObj2;
    }

    activeObj(primary: boolean): Obj {
        const obj = this.activeObjOrNull(primary);
        if (obj === null) {
            throw new Error('Attempt to access null active obj');
        }
        return obj;
    }

    setActiveObj(primary: boolean, obj: Obj) {
        if (primary) {
            this._activeObj = obj;
        } else {
            this._activeObj2 = obj;
        }
    }

    get intOperand(): number {
        return this.script.intOperands[this.pc];
    }

    get stringOperand(): string {
        return this.script.stringOperands[this.pc];
    }

    popInt(): number {
        const value = this.intStack[--this.isp];
        if (!value) {
            return 0;
        }
        return toInt32(value);
    }

    popInts(amount: number): number[] {
        const ints = Array<number>(amount);
        for (let i = amount - 1; i >= 0; i--) {
            ints[i] = this.popInt();
        }
        return ints;
    }

    pushInt(value: number) {
        this.intStack[this.isp++] = toInt32(value);
    }

    popString(): string {
        return this.stringStack[--this.ssp] ?? '';
    }

    popStrings(amount: number): string[] {
        const strings = Array<string>(amount);
        for (let i = amount - 1; i >= 0; i--) {
            strings[i] = this.popString();
        }
        return strings;
    }

    pushString(value: string): void {
        this.stringStack[this.ssp++] = value;
    }

    popFrame(): void {
        const frame = this.frames[--this.fp];
        this.pc = frame.pc;
        this.script = frame.script;
        this.intLocals = frame.intLocals;
        this.stringLocals = frame.stringLocals;
    }

    gosubFrame(proc: ScriptFile): void {
        this.frames[this.fp++] = {
            script: this.script,
            pc: this.pc,
            intLocals: this.intLocals,
            stringLocals: this.stringLocals
        };
        this.setupNewScript(proc);
    }

    gotoFrame(label: ScriptFile): void {
        this.debugFrames[this.debugFp++] = {
            script: this.script,
            pc: this.pc
        };
        this.fp = 0;
        this.frames.length = 0;
        this.setupNewScript(label);
    }

    setupNewScript(script: ScriptFile): void {
        const intLocals: number[] = new Array(script.intLocalCount).fill(0);
        const intArgCount: number = script.intArgCount;
        for (let index: number = 0; index < intArgCount; index++) {
            intLocals[intArgCount - index - 1] = this.popInt();
        }

        const stringLocals: string[] = new Array(script.stringLocalCount);
        const stringArgCount: number = script.stringArgCount;
        for (let index: number = 0; index < stringArgCount; index++) {
            stringLocals[stringArgCount - index - 1] = this.popString();
        }

        this.pc = -1;
        this.script = script;
        this.intLocals = intLocals;
        this.stringLocals = stringLocals;
    }

    reset(): void {
        this.pc = -1;
        this.frames = [];
        this.fp = 0;
        this.intStack = [];
        this.isp = 0;
        this.stringStack = [];
        this.ssp = 0;
        this.intLocals = [];
        this.stringLocals = [];
    }
}
