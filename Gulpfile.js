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
const _AVA_       = `node ./node_modules/ava/cli.js`;
let _TestCommand_ = _AVA_;
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
gulp.task("clean", done => {
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
gulp.task("__build", gulp.series(
    "clean",
    "__compile",
    "__copy"
));

// ---------------------------------------------------------------------------------------------------------------------
const execTests = (done, testPath) => {
    exec(`${_TestCommand_} ${TestPath(testPath)}`, {}, (error, sout, serr) => {
        serr && console.error(serr);
        done(error);
    }).stdout.pipe(process.stdout);
};

// ---------------------------------------------------------------------------------------------------------------------
gulp.task("__tests", done => {
    execTests(done, "");
});
