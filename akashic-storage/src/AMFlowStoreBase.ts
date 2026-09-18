// The MIT License (MIT)
//
// Copyright (c) 2019 DWANGO Co., Ltd.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// Original Source: AMFlowStore (@akashic/headless-driver)
// https://github.com/akashic-games/headless-driver/blob/main/src/play/amflow/AMFlowStore.ts
//
// Modified by multi-indiegame
// * delete on memory store.
// * omit unnecessary option and event handling for this project.

import type { StartPoint } from "@akashic/amflow";
import type { Event, Tick } from "@akashic/playlog";
import { Trigger } from "@akashic/trigger";
import { sha256 } from "js-sha256";

export abstract class AMFlowStoreBase {
    playId: string;
    putStartPointTrigger: Trigger<StartPoint> = new Trigger();
    sendEventTrigger: Trigger<Event> = new Trigger();
    sendTickTrigger: Trigger<Tick> = new Trigger();

    constructor(playId: string) {
        this.playId = playId;
    }

    sendTick(tick: Tick) {
        this.sendTickTrigger.fire(tick);
    }

    sendEvent(event: Event) {
        this.sendEventTrigger.fire(event);
    }

    onTick(handler: (tick: Tick) => void) {
        this.sendTickTrigger.add(handler);
    }

    offTick(handler: (tick: Tick) => void) {
        this.sendTickTrigger.remove(handler);
    }

    onEvent(handler: (event: Event) => void) {
        this.sendEventTrigger.add(handler);
    }

    offEvent(handler: (event: Event) => void) {
        this.sendEventTrigger.remove(handler);
    }

    _createPlayToken() {
        const str = this.createRandomString(10);
        const token = sha256(str);
        return token;
    }

    private createRandomString(length: number) {
        const str = "abcdefghijklmnopqrstuvwxyz0123456789";
        const cl = str.length;
        let r = "";
        for (let i = 0; i < length; i++) {
            r += str[Math.floor(Math.random() * cl)];
        }
        return r;
    }
}
