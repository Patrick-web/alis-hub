const ContentBlock = {
  type: ee.Message.getFieldWithDefault(yt, 1, 0),
  title:
    (ft = yt.getTitle()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Title.toObject(Rt, ft),
  subtitle:
    (ft = yt.getSubtitle()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Subtitle.toObject(Rt, ft),
  heading:
    (ft = yt.getHeading()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Heading.toObject(Rt, ft),
  textBody:
    (ft = yt.getTextBody()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.TextBody.toObject(Rt, ft),
  image:
    (ft = yt.getImage()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Image.toObject(Rt, ft),
  video:
    (ft = yt.getVideo()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Video.toObject(Rt, ft),
  divider:
    (ft = yt.getDivider()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Divider.toObject(Rt, ft),
  linkPreview:
    (ft = yt.getLinkPreview()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.LinkPreview.toObject(Rt, ft),
  footnote:
    (ft = yt.getFootnote()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Footnote.toObject(Rt, ft),
  diagram:
    (ft = yt.getDiagram()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.Diagram.toObject(Rt, ft),
  codeBlock:
    (ft = yt.getCodeBlock()) &&
    proto.alis.open.support.v1.Guide.ContentBlock.CodeBlock.toObject(Rt, ft),
};
