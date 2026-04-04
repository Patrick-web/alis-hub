const Organisation = {
  name: ee.Message.getFieldWithDefault(it, 1, ""),
  displayName: ee.Message.getFieldWithDefault(it, 2, ""),
  description: ee.Message.getFieldWithDefault(it, 3, ""),
  logo: ee.Message.getFieldWithDefault(it, 4, ""),
  googleProject:
    (lt = it.getGoogleProject()) && ft.GoogleProject.toObject(xe, lt),
  bucketsDomain: ee.Message.getFieldWithDefault(it, 6, ""),
  packagesDomain: ee.Message.getFieldWithDefault(it, 10, ""),
  account: ee.Message.getFieldWithDefault(it, 12, ""),
  spannerInstance:
    (lt = it.getSpannerInstance()) &&
    proto.alis.os.products.v1.SpannerInstance.toObject(xe, lt),
  serviceAccount:
    (lt = it.getServiceAccount()) && ft.ServiceAccount.toObject(xe, lt),
  gitRepo: (lt = it.getGitRepo()) && ft.GitRepo.toObject(xe, lt),
  loadbalancer:
    (lt = it.getLoadbalancer()) &&
    proto.alis.os.products.v1.Loadbalancer.toObject(xe, lt),
  state: ee.Message.getFieldWithDefault(it, 21, 0),
  deployOperation: ee.Message.getFieldWithDefault(it, 22, ""),
  lastSuccessfulDeployTime:
    (lt = it.getLastSuccessfulDeployTime()) && gt.Timestamp.toObject(xe, lt),
  workforceFederationPoolId: ee.Message.getFieldWithDefault(it, 31, ""),
  workforceFederationMicrosoftProviderId: ee.Message.getFieldWithDefault(
    it,
    32,
    "",
  ),
  github:
    (lt = it.getGithub()) &&
    proto.alis.os.products.v1.Organisation.Github.toObject(xe, lt),
  createTime: (lt = it.getCreateTime()) && gt.Timestamp.toObject(xe, lt),
  updateTime: (lt = it.getUpdateTime()) && gt.Timestamp.toObject(xe, lt),
};
