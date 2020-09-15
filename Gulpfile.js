// ---------------------------------------------------------------------------------------------------------------------
const gulp  = require("gulp");
const cp    = require("child_process");
const exec  = cp.exec;
const del   = require("del");
const fs    = require("fs");

const RootFolder  = `${__dirname}`;
const DistFolder  = `${RootFolder}/Dist`;
const SrcFolder   = `${RootFolder}/Src`;
const TestFolder  = `${DistFolder}/Test`;
const PerfTestFolder  = `${TestFolder}/Performance`;

const _TSC_       =  `${RootFolder}/node_modules/typescript/bin/tsc`;
const _AVA_       = `node ${RootFolder}/node_modules/ava/cli.js`;
const _NYC_       = `node ${RootFolder}/node_modules/nyc/bin/nyc.js --reporter=lcov ${_AVA_}`;
const _TSLINT_    = `${RootFolder}/node_modules/tslint/bin/tslint`;

// ---------------------------------------------------------------------------------------------------------------------
const DistPath = (aPath = "") => {
    return DistFolder + aPath;
};

const RootPath = (aPath = "") => {
    return RootFolder + aPath;
};

const DistDest = (aPath = "") => {
    return gulp.dest(DistPath(aPath));
};

const Root = (aPath = "") => {
    return gulp.src(RootPath(aPath));
};

const TestPath = (aPath = "") => {
    return `${TestFolder}${aPath}/*.test.js`;
};

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("_clean", done => {
    del([DistPath("**/*")], { force: true });
    done();
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("_compile", done => {
    exec(_TSC_, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});
// ---------------------------------------------------------------------------------------------------------------------
gulp.task("_copy", gulp.parallel(
    () => Root("/tsconfig.json").pipe(DistDest()),
));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("build", gulp.series(
    "_clean",
    "_compile",
    "_copy"
));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("test", done => {
    exec(`${_AVA_} "${DistFolder}/**/*.test.js"`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("perf-test", done =>
{
    let lPerformanceTests = [];
    fs.readdir(PerfTestFolder, function (err, files)
    {
        if (err)
        {
            throw err;
        }

        lPerformanceTests = files;
        QueuePerformanceTest();
    });

    let lCallCount = 0;
    function QueuePerformanceTest(aIndex = 0)
    {
        if (IsValidJS(lPerformanceTests[aIndex]))
        {
            exec(`node "${PerfTestFolder}/${lPerformanceTests[aIndex]}"`, {}, (error, sout, serr) =>
            {
                if (!serr && !error)
                {
                    if (aIndex + 1 < lPerformanceTests.length)
                    {
                        QueuePerformanceTest(++aIndex);
                    }
                    else
                    {
                        done();
                    }
                }
                else
                {
                    serr && console.error(serr);
                    done(error);
                }
            }).stdout.pipe(process.stdout);
        }
        else
        {
            if (++aIndex < lPerformanceTests.length)
                QueuePerformanceTest(aIndex);
            else
                done();
        }
    }

    function IsValidJS(aFileName)
    {
        return aFileName.slice(-8) === ".perf.js";
    }
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("test-network", done => {
    exec(`${_AVA_} "${DistFolder}/**/*.network.js"`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("coverage", done => {
    exec(`${_NYC_} "${DistFolder}/**/*.test.js"`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("coverage-report", done => {
    exec(`codecov`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("lint-fix", done => {
    exec(`${_TSLINT_} --project . --fix`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("lint-check", done => {
    exec(`${_TSLINT_} --project .`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});
