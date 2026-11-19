import { Request, Response } from "express";
import Version from "../models/Versions";
import { version as codeVersion } from "../utils/version";

export const index = async (req: Request, res: Response): Promise<Response> => {
    const version = await Version.findByPk(1);
    return res.status(200).json({
        version: version?.versionFrontend || codeVersion,
        code: codeVersion,
        build: "chat-fix-20260825b"
    });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
    const version = await Version.findByPk(1);
    version.versionFrontend = req.body.version;
    await version.save();

    return res.status(200).json({
        version: version.versionFrontend,
        code: codeVersion
    });
};
