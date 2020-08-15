// ---------------------------------------------------------------------------------------------------------------------
const gulp  = require("gulp");
const cp    = require("child_process");
const exec  = cp.exec;
const del   = require("del");

const RootFolder  = `${__dirname}`;
const DistFolder  = `${RootFolder}/Dist`;
const SrcFolder   = `${RootFolder}/Src`;
const TestFolder  = `${DistFolder}/Test`;

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
