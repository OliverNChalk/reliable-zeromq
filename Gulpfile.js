// ---------------------------------------------------------------------------------------------------------------------
const gulp  = require("gulp");
const cp    = require("child_process");
const exec  = cp.exec;
const del   = require("del");

const DistFolder  = "./Dist";
const RootFolder  = "./";
const SrcFolder   = "./Src";
const TestFolder  = `${DistFolder}/Test`;

const _TSC_       = `tsc`;
const _AVA_       = `node ./node_modules/ava/cli.js \\"${DistFolder}/**/*.test.js\\"`;
const _NYC_       = `node ./node_modules/nyc/bin/nyc.js --reporter=lcov ${_AVA_}`;

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
gulp.task("__clean", done => {
    del([DistPath("**/*")], { force: true });
    done();
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("__compile", done => {
    exec(_TSC_, { cwd: SrcFolder}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("__copy", gulp.parallel(
    () => Root("tsconfig.json").pipe(DistDest()),
));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("build", gulp.series(
    "__clean",
    "__compile",
    "__copy"
));

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("test", done => {
    exec(`${_AVA_}`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
});

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("coverage", done => {
    exec(`${_NYC_}`, {}, (error, sout, serr) => {
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
