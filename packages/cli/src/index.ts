#!/usr/bin/env node
import { program } from "commander";
import { registerValidateCommand } from "./commands/validate.js";
import { registerRenderCommand } from "./commands/render.js";
import { registerRenderFrameCommand } from "./commands/render-frame.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerMotionCommand } from "./commands/motion.js";
import { registerBlenderCommand } from "./commands/blender.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerScenarioCommand } from "./commands/scenario.js";
import { registerSceneCommand } from "./commands/scene.js";
import { logCommand } from "./utils/logger.js";

program
  .name("anime")
  .description("22B Anime Engine CLI — JSON in, MP4 out")
  .version("0.1.0");

registerValidateCommand(program);
registerRenderCommand(program);
registerRenderFrameCommand(program);
registerDoctorCommand(program);
registerMotionCommand(program);
registerBlenderCommand(program);
registerPlanCommand(program);
registerScenarioCommand(program);
registerSceneCommand(program);

logCommand(process.argv);
program.parse();
