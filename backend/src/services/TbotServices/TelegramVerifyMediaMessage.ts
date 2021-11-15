import { join } from "path";
import { promisify } from "util";
import { writeFile, createWriteStream } from "fs";
import * as Sentry from "@sentry/node";

import { Context } from "telegraf";
import axios from "axios";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";

import Message from "../../models/Message";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";

const writeFileAsync = promisify(writeFile);

const getMediaInfo = (msg: any) => {
  // eslint-disable-next-line prettier/prettier
  const mediaType = msg.photo ? "photo" : msg.video ? "video" : msg.audio ? "audio" : msg.voice ? "voice" : msg.sticker && !msg.sticker.is_animated ? "sticker" : "document";
  const mediaObj = msg[mediaType];
  // eslint-disable-next-line prettier/prettier
  const [type, mimeType, SAD, fileName, fileId, caption, SAV] = [mediaType, mediaObj.mime_type ? mediaObj.mime_type : "", false, null, mediaObj.file_id ? mediaObj.file_id : mediaObj[0].file_id, msg.caption ? msg.caption : "", mediaType == "voice"];
  switch (mediaType) {
    case "photo":
      return {
        type,
        mimeType: "image/png",
        SAD,
        fileName,
        fileId,
        caption,
        SAV
      };
      break;
    case "video":
      return { type, mimeType, SAD, fileName, fileId, caption, SAV };
      break;
    case "audio":
      return { type, mimeType, SAD, fileName, fileId, caption, SAV };
      break;
    case "voice":
      return { type, mimeType, SAD, fileName, fileId, caption, SAV };
      break;
    case "sticker":
      return {
        type,
        mimeType: "image/webp",
        SAD,
        fileName,
        fileId,
        caption,
        SAV,
        SAS: true
      };
      break;
    default:
      return {
        type,
        mimeType,
        SAD: true,
        fileName: mediaObj.file_name ? mediaObj.file_name : null,
        fileId,
        caption,
        SAV
      };
      break;
  }
};

const downloadFile = async (url: any, pathFile: string) => {
  const response = await axios({ url: url.toString(), responseType: "stream" });
  const writer = createWriteStream(pathFile);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

const VerifyMediaMessage = async (
  ctx: Context | any,
  fromMe: boolean,
  ticket: Ticket,
  contact: Contact
): Promise<Message> => {
  // const quotedMsg = await VerifyQuotedMessage(msg);
  const mediaInfo = await getMediaInfo(ctx.message);
  const media = await ctx.telegram.getFile(mediaInfo.fileId);

  if (!media) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  const ext = mediaInfo.mimeType.split("/")[1].split(";")[0];
  const filename = `${media.file_id}_${new Date().getTime()}.${ext}`;
  const pathFile = join(__dirname, "..", "..", "..", "..", "public", filename);

  const linkDownload = await ctx.telegram.getFileLink(mediaInfo.fileId);
  await downloadFile(linkDownload, pathFile);
  // const media = await ctx.telegram.getFile(ctx.message?.);

  // Sentry.captureException(err);
  // logger.error(err);

  const messageData = {
    messageId: String(ctx.message?.message_id),
    ticketId: ticket.id,
    contactId: fromMe ? undefined : contact.id,
    body: ctx.message.text || ctx.message.caption || filename,
    fromMe,
    read: fromMe,
    mediaUrl: filename,
    mediaType: mediaInfo.mimeType.split("/")[0],
    quotedMsgId: "",
    timestamp: ctx.message.date,
    status: fromMe ? "sended" : "received"
  };

  await ticket.update({
    lastMessage: ctx.message.text || ctx.message.caption || filename,
    answered: fromMe || false
  });
  const newMessage = await CreateMessageService({
    messageData,
    tenantId: ticket.tenantId
  });

  return newMessage;
};

export default VerifyMediaMessage;
