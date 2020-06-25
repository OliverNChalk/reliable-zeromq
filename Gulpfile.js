// ---------------------------------------------------------------------------------------------------------------------
const gulp  = require("gulp");
const cp    = require("child_process");
const exec  = cp.exec;
const del   = require("del");

const DistFolder  = "./Dist";
const RootFolder  = "./";
const SrcFolder   = "./Src";

const _TSC_       = `tsc`;
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
