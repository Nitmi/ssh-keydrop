import installer from "./install.sh?raw";
import { createService } from "./worker.ts";

export default { fetch: createService(installer) };
