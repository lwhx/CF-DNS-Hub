"use strict";

// Reuse the existing Express app so Vercel can run it as a serverless function.
module.exports = require("../server/server");
