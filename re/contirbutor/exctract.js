const Contributor = {
  user: ee.Message.getFieldWithDefault(St, 1, ""),
  displayName: ee.Message.getFieldWithDefault(St, 2, ""),
  maskedEmail: ee.Message.getFieldWithDefault(St, 3, ""),
  picture: ee.Message.getFieldWithDefault(St, 4, ""),
};

const ContributionSessionUser = {
  name: ee.Message.getFieldWithDefault(it, 1, ""),
  displayName: ee.Message.getFieldWithDefault(it, 2, ""),
  maskedEmail: ee.Message.getFieldWithDefault(it, 3, ""),
  picture: ee.Message.getFieldWithDefault(it, 4, ""),
  engagement: ee.Message.getFieldWithDefault(it, 5, 0),
  contributionOverview: ee.Message.getFieldWithDefault(it, 6, ""),
  hasSeen: ee.Message.getBooleanFieldWithDefault(it, 7, !1),
  hasCompleted: ee.Message.getBooleanFieldWithDefault(it, 8, !1),
};
