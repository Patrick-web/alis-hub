const Invite = {
  user: ee.Message.getFieldWithDefault(xe, 1, ""),
  email: ee.Message.getFieldWithDefault(xe, 2, ""),
  displayName: ee.Message.getFieldWithDefault(xe, 3, ""),
  profilePictureUri: ee.Message.getFieldWithDefault(xe, 4, ""),
  domain: ee.Message.getFieldWithDefault(xe, 5, ""),
  claimedTime: (it = xe.getClaimedTime()) && pt.Timestamp.toObject(ut, it),
  role: ee.Message.getFieldWithDefault(xe, 7, 0),
};
