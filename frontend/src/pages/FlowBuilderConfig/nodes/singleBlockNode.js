import {
  AccessTime,
  ArrowForwardIos,
  ContentCopy,
  Delete,
  Image,
  LibraryBooks,
  Message,
  MicNone,
  Videocam,
} from "@mui/icons-material";
import React, { memo } from "react";

import { Handle } from "react-flow-renderer";
import { useNodeStorage } from "../../../stores/useNodeStorage";
import { Typography } from "@mui/material";

export default memo(({ data = {}, isConnectable, id }) => {
  const storageItems = useNodeStorage();
  const seqList = Array.isArray(data?.seq) ? data.seq : [];
  const elementsList = Array.isArray(data?.elements) ? data.elements : [];

  return (
    <div
      style={{
        backgroundColor: "#FEFAFA",
        padding: "8px",
        borderRadius: "8px",
        border: "1px solid rgba(236, 88, 88, 0.25)",
        boxShadow: "rgba(0, 0, 0, 0.05) 0px 3px 5px",
        minWidth: "180px",
      }}
    >
      <Handle
        type="target"
        position="left"
        style={{
          background: "#9a00ed",
          width: "18px",
          height: "18px",
          top: "20px",
          left: "-12px",
          cursor: "pointer",
        }}
        onConnect={(params) => console.log("handle onConnect", params)}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#ffff",
            width: "10px",
            height: "10px",
            marginLeft: "2.9px",
            marginBottom: "1px",
            pointerEvents: "none",
          }}
        />
      </Handle>
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: 5,
          top: 5,
          cursor: "pointer",
          gap: 6,
        }}
      >
        <ContentCopy
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("duplicate");
          }}
          sx={{ width: "12px", height: "12px", color: "#EC5858" }}
        />

        <Delete
          onClick={() => {
            storageItems.setNodesStorage(id);
            storageItems.setAct("delete");
          }}
          sx={{ width: "12px", height: "12px", color: "#EC5858" }}
        />
      </div>
      <div
        style={{
          color: "#ededed",
          fontSize: "16px",
          flexDirection: "row",
          display: "flex",
          alignItems: "center",
          marginBottom: "4px",
        }}
      >
        <LibraryBooks
          sx={{
            width: "16px",
            height: "16px",
            marginRight: "4px",
            color: "#EC5858",
          }}
        />
        <div style={{ color: "#232323", fontSize: "14px", fontWeight: 600 }}>
          {data?.label || "Conteúdo"}
        </div>
      </div>
      {data?.secction && (
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>
          {data.secction}
        </div>
      )}
      <div style={{ color: "#232323", fontSize: "12px", width: 180 }}>
        {seqList.map((item, idx) => {
          const matchedEl = elementsList.find((el) => el?.number === item);
          const itemVal = matchedEl?.value || matchedEl?.original || "";

          return (
            <div
              key={idx}
              style={{
                backgroundColor: "#F6EEEE",
                marginBottom: "3px",
                borderRadius: "5px",
              }}
            >
              {typeof item === "string" && item.includes("message") && (
                <div style={{ gap: "5px", padding: "6px" }}>
                  <div
                    style={{
                      display: "flex",
                      position: "relative",
                      flexDirection: "row",
                      justifyContent: "center",
                    }}
                  >
                    <Message sx={{ color: "#EC5858" }} />
                  </div>
                  <Typography
                    textAlign={"center"}
                    sx={{
                      textOverflow: "ellipsis",
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {itemVal}
                  </Typography>
                </div>
              )}
              {typeof item === "string" && item.includes("interval") && (
                <div style={{ gap: "5px", padding: "6px" }}>
                  <div
                    style={{
                      display: "flex",
                      position: "relative",
                      flexDirection: "row",
                      justifyContent: "center",
                    }}
                  >
                    <AccessTime sx={{ color: "#EC5858" }} />
                  </div>
                  <Typography
                    textAlign={"center"}
                    sx={{
                      textOverflow: "ellipsis",
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {itemVal} segundos
                  </Typography>
                </div>
              )}
              {typeof item === "string" && item.includes("img") && (
                <div style={{ gap: "5px", padding: "6px" }}>
                  <div
                    style={{
                      display: "flex",
                      position: "relative",
                      flexDirection: "row",
                      justifyContent: "center",
                    }}
                  >
                    <Image sx={{ color: "#EC5858" }} />
                  </div>
                  <Typography
                    textAlign={"center"}
                    sx={{
                      textOverflow: "ellipsis",
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {itemVal}
                  </Typography>
                </div>
              )}
              {typeof item === "string" && item.includes("audio") && (
                <div style={{ gap: "5px", padding: "6px" }}>
                  <div
                    style={{
                      display: "flex",
                      position: "relative",
                      flexDirection: "row",
                      justifyContent: "center",
                    }}
                  >
                    <MicNone sx={{ color: "#EC5858" }} />
                  </div>
                  <Typography
                    textAlign={"center"}
                    sx={{
                      textOverflow: "ellipsis",
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {itemVal}
                  </Typography>
                </div>
              )}
              {typeof item === "string" && item.includes("video") && (
                <div style={{ gap: "5px", padding: "6px" }}>
                  <div
                    style={{
                      display: "flex",
                      position: "relative",
                      flexDirection: "row",
                      justifyContent: "center",
                    }}
                  >
                    <Videocam sx={{ color: "#EC5858" }} />
                  </div>
                  <Typography
                    textAlign={"center"}
                    sx={{
                      textOverflow: "ellipsis",
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {itemVal}
                  </Typography>
                </div>
              )}
              {typeof item === "string" && item.includes("document") && (
                <div style={{ gap: "5px", padding: "6px" }}>
                  <div
                    style={{
                      display: "flex",
                      position: "relative",
                      flexDirection: "row",
                      justifyContent: "center",
                    }}
                  >
                    <LibraryBooks sx={{ color: "#EC5858" }} />
                  </div>
                  <Typography
                    textAlign={"center"}
                    sx={{
                      textOverflow: "ellipsis",
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {itemVal}
                  </Typography>
                </div>
              )}
            </div>
          );
        })}
        {seqList.length === 0 && elementsList.length > 0 && (
          <div>
            {elementsList.map((el, idx) => (
              <Typography
                key={idx}
                sx={{
                  fontSize: "10px",
                  color: "#444",
                  backgroundColor: "#F6EEEE",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  marginBottom: "3px",
                }}
              >
                {el?.value || el?.original || "Bloco"}
              </Typography>
            ))}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position="right"
        id="a"
        style={{
          background: "#9a00ed",
          width: "18px",
          height: "18px",
          top: "90%",
          right: "-11px",
          cursor: "pointer",
        }}
        isConnectable={isConnectable}
      >
        <ArrowForwardIos
          sx={{
            color: "#ffff",
            width: "10px",
            height: "10px",
            marginLeft: "2.9px",
            marginBottom: "1px",
            pointerEvents: "none",
          }}
        />
      </Handle>
    </div>
  );
});
