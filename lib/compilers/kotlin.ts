// Copyright (c) 2021, Compiler Explorer Authors
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

import path from 'node:path';

import _ from 'underscore';

import {
    BypassCache,
    CacheKey,
    CompilationResult,
    ExecutionOptionsWithEnv,
} from '../../types/compilation/compilation.interfaces.js';
import type {PreliminaryCompilerInfo} from '../../types/compiler.interfaces.js';
import {ExecutableExecutionOptions} from '../../types/execution/execution.interfaces.js';
import type {ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces.js';
import {assert} from '../assert.js';
import {SimpleOutputFilenameCompiler} from '../base-compiler.js';
import {CompilationEnvironment} from '../compilation-env.js';

import {KotlinParser} from './argument-parsers.js';
import {JavaCompiler} from './java.js';

export class KotlinCompiler extends JavaCompiler implements SimpleOutputFilenameCompiler {
    static override get key() {
        return 'kotlin';
    }

    javaHome: string;

    constructor(compilerInfo: PreliminaryCompilerInfo, env: CompilationEnvironment) {
        super(compilerInfo, env);
        this.javaHome = this.compilerProps<string>(`compiler.${this.compiler.id}.java_home`);
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
        // The items in 'options' before the source file are user inputs.
        const sourceFileOptionIndex = options.findIndex(option => {
            return option.endsWith('.kt');
        });
        const userOptions = options.slice(0, sourceFileOptionIndex);
        const kotlinOptions = _.compact([...this.getClasspathArgument(), ...userOptions, inputFilename]);
        const result = await this.exec(compiler, kotlinOptions, execOptions);
        return {
            ...this.transformToCompilationResult(result, inputFilename),
            languageId: this.getCompilerResultLanguageId(filters),
            instructionSet: this.getInstructionSetFromCompilerArgs(options),
        };
    }

    override getDefaultExecOptions() {
        const execOptions = super.getDefaultExecOptions();
        if (this.javaHome) {
            execOptions.env.JAVA_HOME = this.javaHome;
        }

        return execOptions;
    }

    override async getMainClassName() {
        return 'ExampleKt';
    }

    override filterUserOptions(userOptions: string[]) {
        // filter options without extra arguments
        userOptions = (userOptions || []).filter(
            option => option !== '-script' && option !== '-progressive' && !option.startsWith('-Xjavac'),
        );

        const oneArgForbiddenList = new Set([
            // -jdk-home path
            // Include a custom JDK from the specified location
            // into the classpath instead of the default JAVA_HOME
            '-jdk-home',
            // -kotlin-home path
            // Path to the home directory of Kotlin compiler used for
            // discovery of runtime libraries
            '-kotlin-home',
        ]);

        // filter options with one argument
        return super.filterUserOptionsWithArg(userOptions, oneArgForbiddenList);
    }

    override optionsForFilter(filters: ParseFiltersAndOutputOptions) {
        // Forcibly enable javap
        filters.binary = true;

        return ['-Xjavac-arguments="-Xlint:all"'];
    }

    /**
     * Handle Kotlin execution.
     *
     * Kotlin execution differs in the way that Kotlin requires its standard
     * standard library because that's where the runtime libraries such as
     * kotlin.jvm.internal.Intrinsics is.
     *
     * Therefore, we append the -include-runtime and -d flags to specify where
     * to output the jarfile which we will run using `java -jar`
     *
     * TODO(supergrecko): Find a better fix than this bandaid for execution
     */
    override async handleInterpreting(
        key: CacheKey,
        executeParameters: ExecutableExecutionOptions,
    ): Promise<CompilationResult> {
        const alteredKey = {
            ...key,
            options: ['-include-runtime', '-d', 'example.jar'],
        };
        const executablePackageHash = this.env.getExecutableHash(key);
        const compileResult = await this.getOrBuildExecutable(alteredKey, BypassCache.None, executablePackageHash);
        assert(compileResult.dirPath !== undefined);
        if (compileResult.code !== 0) {
            return {
                stdout: compileResult.stdout,
                stderr: compileResult.stderr,
                code: compileResult.code,
                didExecute: false,
                buildResult: compileResult,
                timedOut: false,
            };
        }

        executeParameters.args = [
            '-Xss136K', // Reduce thread stack size
            '-XX:CICompilerCount=2', // Reduce JIT compilation threads. 2 is minimum
            '-XX:-UseDynamicNumberOfCompilerThreads',
            '-XX:-UseDynamicNumberOfGCThreads',
            '-XX:+UseSerialGC', // Disable parallell/concurrent garbage collector
            '-cp',
            compileResult.dirPath,
            '-jar',
            'example.jar',
            // -jar <jar> has to be the last java parameter, otherwise it will use
            // our java parameters as program parameters
            ...executeParameters.args,
        ];

        const result = await this.runExecutable(this.javaRuntime, executeParameters, compileResult.dirPath);
        return {
            ...result,
            didExecute: true,
            buildResult: compileResult,
        };
    }

    override getArgumentParserClass() {
        return KotlinParser;
    }
}
