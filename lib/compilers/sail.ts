// Copyright (c) 2025, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import path from 'path';

import type {PreliminaryCompilerInfo} from '../../types/compiler.interfaces.js';
import type {ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces.js';
import {BaseCompiler} from '../base-compiler.js';
import {CompilationEnvironment} from '../compilation-env.js';
import { CacheKey, CompilationCacheKey, CompilationResult, ExecutionOptionsWithEnv } from '../../types/compilation/compilation.interfaces.js';
import { SelectedLibraryVersion } from '../../types/libraries/libraries.interfaces.js';

export class SailCompiler extends BaseCompiler {
    static get key() {
        return 'sail';
    }

    constructor(info: PreliminaryCompilerInfo, env: CompilationEnvironment) {
        super(info, env);

        this.outputFilebase = 'model';
    }

    override optionsForFilter(filters: ParseFiltersAndOutputOptions, outputFilename: any) {
        // By default this adds C compiler options (-g etc).
        return [];
    }

    override async runCompiler(
        compiler: string,
        options: string[],
        inputFilename: string,
        execOptions: ExecutionOptionsWithEnv,
        filters?: ParseFiltersAndOutputOptions,
    ): Promise<CompilationResult> {
        if (!execOptions) {
            execOptions = this.getDefaultExecOptions();
        }

        if (!execOptions.customCwd) {
            execOptions.customCwd = path.dirname(inputFilename);
        }

        const fullResult: CompilationResult = {
            code: 0,
            timedOut: false,
            stdout: [],
            stderr: [],
            buildsteps: [],
            inputFilename,
        };

        const sailResult = await this.doBuildstepAndAddToResult(
            fullResult,
            'Sail to C',
            compiler,
            [...options, '-o', this.outputFilebase],
            execOptions,
        );

        if (sailResult.code !== 0 || filters?.binary !== true) {
            return fullResult;
        }

        fullResult.executableFilename = inputFilename + '.exe';

        const sailDirResult = await this.doBuildstepAndAddToResult(
            fullResult,
            'Get Sail dir',
            compiler,
            ['-dir'],
            execOptions,
        );

        if (sailDirResult.code !== 0) {
            return fullResult;
        }

        const sailDir = sailDirResult.stdout.map(line => line.text).join('\n').trim();

        await this.doBuildstepAndAddToResult(
            fullResult,
            'C to binary',
            'cc',
            [
                `${this.outputFilebase}.c`,
                '-I', `${sailDir}/lib`,
                `${sailDir}/lib/elf.c`,
                `${sailDir}/lib/rts.c`,
                `${sailDir}/lib/sail.c`,
                `${sailDir}/lib/sail_failure.c`,
                '-lz', // TODO: This can be removed in Sail 0.19
                '-lgmp',
                '-o', `${this.outputFilebase}.exe`
            ],
            execOptions,
        );

        return fullResult;
    }

    override getOutputFilename(dirPath: string, outputFilebase: string, key?: any): string {
        return path.join(dirPath, `${outputFilebase}.c`);
    }

    override getExecutableFilename(dirPath: string, outputFilebase: string, key?: CacheKey | CompilationCacheKey) {
        return path.join(dirPath, `${outputFilebase}.exe`);
    }

    override getSharedLibraryPathsAsArguments(
        libraries: SelectedLibraryVersion[],
        libDownloadPath: string | undefined,
        toolchainPath: string | undefined,
        dirPath: string,
    ): string[] {
        // By default this adds -L./lib which isn't understood by the Sail compiler.
        return [];
    }
}
