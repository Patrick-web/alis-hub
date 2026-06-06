const ServiceAccount = {
  name: ee.Message.getFieldWithDefault(rt, 1, ""),
  projectId: ee.Message.getFieldWithDefault(rt, 2, ""),
  uniqueId: ee.Message.getFieldWithDefault(rt, 4, ""),
  email: ee.Message.getFieldWithDefault(rt, 5, ""),
  displayName: ee.Message.getFieldWithDefault(rt, 6, ""),
  etag: rt.getEtag_asB64(),
  description: ee.Message.getFieldWithDefault(rt, 8, ""),
  oauth2ClientId: ee.Message.getFieldWithDefault(rt, 9, ""),
  disabled: ee.Message.getBooleanFieldWithDefault(rt, 11, !1),
};

const SetupProductRequest = {
  existingOrganisation: (lt = ee.Message.getField(it, 1)) == null ? void 0 : lt,
  newOrganisation:
    (lt = it.getNewOrganisation()) &&
    proto.alis.os.products.v1.SetupProductRequest.NewOrganisation.toObject(
      xe,
      lt,
    ),
  productId: ee.Message.getFieldWithDefault(it, 3, ""),
  displayName: ee.Message.getFieldWithDefault(it, 4, ""),
  onlyDevEnvironment: ee.Message.getBooleanFieldWithDefault(it, 5, !1),
  productAdminsList:
    (lt = ee.Message.getRepeatedField(it, 6)) == null ? void 0 : lt,
  productBuildersList:
    (lt = ee.Message.getRepeatedField(it, 7)) == null ? void 0 : lt,
};

const SetupProductRequestNewOrganisation = {
  organisationId: ee.Message.getFieldWithDefault(it, 1, ""),
  displayName: ee.Message.getFieldWithDefault(it, 2, ""),
  gcpRegion: ee.Message.getFieldWithDefault(it, 3, ""),
  gcpFolderId: ee.Message.getFieldWithDefault(it, 4, ""),
  gcpBillingAccountId: ee.Message.getFieldWithDefault(it, 5, ""),
  account: ee.Message.getFieldWithDefault(it, 6, ""),
};

const Product = {
  name: ee.Message.getFieldWithDefault(it, 1, ""),
  displayName: ee.Message.getFieldWithDefault(it, 2, ""),
  description: ee.Message.getFieldWithDefault(it, 3, ""),
  logo: ee.Message.getFieldWithDefault(it, 4, ""),
  googleProject:
    (lt = it.getGoogleProject()) && ft.GoogleProject.toObject(xe, lt),
  spannerDatabase:
    (lt = it.getSpannerDatabase()) && ft.SpannerDatabase.toObject(xe, lt),
  serviceAccount:
    (lt = it.getServiceAccount()) && ft.ServiceAccount.toObject(xe, lt),
  gitRepo: (lt = it.getGitRepo()) && ft.GitRepo.toObject(xe, lt),
  internalPackageRegistries:
    (lt = it.getInternalPackageRegistries()) &&
    ft.PackageRegistries.toObject(xe, lt),
  dockerRegistries:
    (lt = it.getDockerRegistries()) && ft.DockerRegistries.toObject(xe, lt),
  state: ee.Message.getFieldWithDefault(it, 21, 0),
  deployOperation: ee.Message.getFieldWithDefault(it, 22, ""),
  lastSuccessfulDeployTime:
    (lt = it.getLastSuccessfulDeployTime()) && gt.Timestamp.toObject(xe, lt),
  accessibleProductsList:
    (lt = ee.Message.getRepeatedField(it, 24)) == null ? void 0 : lt,
  sandboxState: ee.Message.getFieldWithDefault(it, 25, 0),
  sandboxDomain: ee.Message.getFieldWithDefault(it, 26, ""),
  createTime: (lt = it.getCreateTime()) && gt.Timestamp.toObject(xe, lt),
  updateTime: (lt = it.getUpdateTime()) && gt.Timestamp.toObject(xe, lt),
};

const BuildPartner = {
  name: ee.Message.getFieldWithDefault(it, 1, ""),
  displayName: ee.Message.getFieldWithDefault(it, 2, ""),
  websiteUri: ee.Message.getFieldWithDefault(it, 3, ""),
  description: ee.Message.getFieldWithDefault(it, 4, ""),
  logoUri: ee.Message.getFieldWithDefault(it, 5, ""),
  partnerContact:
    (lt = it.getPartnerContact()) &&
    proto.alis.os.accounts.v1.BuildPartner.ContactInfo.toObject(xe, lt),
  generalContact:
    (lt = it.getGeneralContact()) &&
    proto.alis.os.accounts.v1.BuildPartner.ContactInfo.toObject(xe, lt),
  subtitle: ee.Message.getFieldWithDefault(it, 8, ""),
  servicesOfferedList:
    (lt = ee.Message.getRepeatedField(it, 9)) == null ? void 0 : lt,
  specializationsList:
    (lt = ee.Message.getRepeatedField(it, 10)) == null ? void 0 : lt,
  industryFocusesList:
    (lt = ee.Message.getRepeatedField(it, 11)) == null ? void 0 : lt,
  googleCloudPartnership:
    (lt = it.getGoogleCloudPartnership()) &&
    proto.alis.os.accounts.v1.BuildPartner.GoogleCloudPartnership.toObject(
      xe,
      lt,
    ),
  account: ee.Message.getFieldWithDefault(it, 13, ""),
  countryCode: ee.Message.getFieldWithDefault(it, 14, ""),
  createdTime: (lt = it.getCreatedTime()) && ft.Timestamp.toObject(xe, lt),
  updatedTime: (lt = it.getUpdatedTime()) && ft.Timestamp.toObject(xe, lt),
  ContactInfo: {
    displayName: ee.Message.getFieldWithDefault(it, 1, ""),
    email: ee.Message.getFieldWithDefault(it, 2, ""),
    phone: (lt = it.getPhone()) && ct.PhoneNumber.toObject(xe, lt),
    address: (lt = it.getAddress()) && ut.PostalAddress.toObject(xe, lt),
  },
};

const Invite = {
  User: {
    user: ee.Message.getFieldWithDefault(xe, 1, ""),
    email: ee.Message.getFieldWithDefault(xe, 2, ""),
    displayName: ee.Message.getFieldWithDefault(xe, 3, ""),
    profilePictureUri: ee.Message.getFieldWithDefault(xe, 4, ""),
    domain: ee.Message.getFieldWithDefault(xe, 5, ""),
    claimedTime: (it = xe.getClaimedTime()) && pt.Timestamp.toObject(ut, it),
    role: ee.Message.getFieldWithDefault(xe, 7, 0),
  },
};

const Seat = {
  UserInformation: {
    email: ee.Message.getFieldWithDefault(yt, 1, ""),
    displayName: ee.Message.getFieldWithDefault(yt, 2, ""),
    profileUrl: ee.Message.getFieldWithDefault(yt, 3, ""),
  },
};

const Lens = {
  Table: {
    idea: ee.Message.getFieldWithDefault(ft, 1, ""),
    displayName: ee.Message.getFieldWithDefault(ft, 2, ""),
    hidden: ee.Message.getBooleanFieldWithDefault(ft, 3, !1),
    description: ee.Message.getFieldWithDefault(ft, 4, ""),
    user:
      (ct = ft.getUser()) &&
      proto.alis.os.ideas.v1.Lens.Table.Entry.User.toObject(yt, ct),
    contributionCount: ee.Message.getFieldWithDefault(ft, 6, 0),
    lastActivityTime:
      (ct = ft.getLastActivityTime()) && pt.Timestamp.toObject(yt, ct),
    state: ee.Message.getFieldWithDefault(ft, 8, 0),
    Entry: {
      name: ee.Message.getFieldWithDefault(ft, 1, ""),
      displayName: ee.Message.getFieldWithDefault(ft, 2, ""),
      pictureUri: ee.Message.getFieldWithDefault(ft, 3, ""),
    },
    Grid: {
      Entry: {
        idea: ee.Message.getFieldWithDefault(ft, 1, ""),
        displayName: ee.Message.getFieldWithDefault(ft, 2, ""),
        hidden: ee.Message.getBooleanFieldWithDefault(ft, 3, !1),
      },
    },
    Live: {
      Idea: {
        idea: ee.Message.getFieldWithDefault(ft, 1, ""),
        displayName: ee.Message.getFieldWithDefault(ft, 2, ""),
        hidden: ee.Message.getBooleanFieldWithDefault(ft, 3, !1),
      },
    },
    MaturityGrid: {
      Entry: {
        idea: ee.Message.getFieldWithDefault(ft, 1, ""),
        displayName: ee.Message.getFieldWithDefault(ft, 2, ""),
        hidden: ee.Message.getBooleanFieldWithDefault(ft, 3, !1),
        contributionCount: ee.Message.getFieldWithDefault(ft, 4, 0),
      },
    },
  },
};

proto.alis.os.buildspecs.v1.BuildSpec.toObject = function (ct, ut) {
  var xe,
    it = {
      name: ee.Message.getFieldWithDefault(ut, 1, ""),
      displayName: ee.Message.getFieldWithDefault(ut, 2, ""),
      status: ee.Message.getFieldWithDefault(ut, 3, 0),
      summary: ee.Message.getFieldWithDefault(ut, 4, ""),
      content:
        (xe = ut.getContent()) &&
        proto.alis.os.buildspecs.v1.BuildSpec.Content.toObject(ct, xe),
      productsList:
        (xe = ee.Message.getRepeatedField(ut, 6)) == null ? void 0 : xe,
      account: ee.Message.getFieldWithDefault(ut, 7, ""),
      extensionsEnabledList:
        (xe = ee.Message.getRepeatedField(ut, 8)) == null ? void 0 : xe,
      neuronsList:
        (xe = ee.Message.getRepeatedField(ut, 9)) == null ? void 0 : xe,
      etag: ee.Message.getFieldWithDefault(ut, 97, ""),
      createTime: (xe = ut.getCreateTime()) && gt.Timestamp.toObject(ct, xe),
      updateTime: (xe = ut.getUpdateTime()) && gt.Timestamp.toObject(ct, xe),
      deleteTime: (xe = ut.getDeleteTime()) && gt.Timestamp.toObject(ct, xe),
    };
  return (ct && (it.$jspbMessageInstance = ut), it);
};

proto.alis.os.iam.v2.Group.toObject = function (ct, ut) {
  var xe,
    it = {
      name: ee.Message.getFieldWithDefault(ut, 1, ""),
      displayName: ee.Message.getFieldWithDefault(ut, 2, ""),
      description: ee.Message.getFieldWithDefault(ut, 3, ""),
      etag: ee.Message.getFieldWithDefault(ut, 97, ""),
      createTime: (xe = ut.getCreateTime()) && gt.Timestamp.toObject(ct, xe),
      updateTime: (xe = ut.getUpdateTime()) && gt.Timestamp.toObject(ct, xe),
    };
  return (ct && (it.$jspbMessageInstance = ut), it);
};

proto.alis.os.ideas.v1.Collection.toObject = function (xe, it) {
  var lt,
    rt = {
      name: ee.Message.getFieldWithDefault(it, 1, ""),
      displayName: ee.Message.getFieldWithDefault(it, 2, ""),
      description: ee.Message.getFieldWithDefault(it, 3, ""),
      membersList: ee.Message.toObjectList(
        it.getMembersList(),
        proto.alis.os.ideas.v1.Collection.Member.toObject,
        xe,
      ),
      cycleDisplayNamesMap: (lt = it.getCycleDisplayNamesMap())
        ? lt.toObject(xe, void 0)
        : [],
      framing:
        (lt = it.getFraming()) &&
        proto.alis.os.ideas.v1.Collection.Framing.toObject(xe, lt),
      account: ee.Message.getFieldWithDefault(it, 96, ""),
      createTime: (lt = it.getCreateTime()) && ct.Timestamp.toObject(xe, lt),
      updateTime: (lt = it.getUpdateTime()) && ct.Timestamp.toObject(xe, lt),
    };
  return (xe && (rt.$jspbMessageInstance = it), rt);
};

proto.alis.os.products.v1.Environment.toObject = function (it, lt) {
  var rt,
    mt = {
      name: ee.Message.getFieldWithDefault(lt, 1, ""),
      displayName: ee.Message.getFieldWithDefault(lt, 2, ""),
      description: ee.Message.getFieldWithDefault(lt, 3, ""),
      googleProject:
        (rt = lt.getGoogleProject()) && ct.GoogleProject.toObject(it, rt),
      spannerDatabase:
        (rt = lt.getSpannerDatabase()) && ct.SpannerDatabase.toObject(it, rt),
      type: ee.Message.getFieldWithDefault(lt, 7, 0),
      envsList: ee.Message.toObjectList(
        lt.getEnvsList(),
        proto.alis.os.products.v1.Environment.Env.toObject,
        it,
      ),
      state: ee.Message.getFieldWithDefault(lt, 21, 0),
      deployOperation: ee.Message.getFieldWithDefault(lt, 22, ""),
      lastSuccessfulDeployTime:
        (rt = lt.getLastSuccessfulDeployTime()) &&
        gt.Timestamp.toObject(it, rt),
      createTime: (rt = lt.getCreateTime()) && gt.Timestamp.toObject(it, rt),
      updateTime: (rt = lt.getUpdateTime()) && gt.Timestamp.toObject(it, rt),
    };
  return (it && (mt.$jspbMessageInstance = lt), mt);
};

proto.alis.os.products.v1.Organisation.toObject = function (xe, it) {
  var lt,
    rt = {
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
        (lt = it.getLastSuccessfulDeployTime()) &&
        gt.Timestamp.toObject(xe, lt),
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
  return (xe && (rt.$jspbMessageInstance = it), rt);
};

proto.alis.os.resources.products.v1.Artifact.toObject = function (bt, Mt) {
  var Bt,
    Ct = {
      name: ee.Message.getFieldWithDefault(Mt, 1, ""),
      updateTime: (Bt = Mt.getUpdateTime()) && ct.Timestamp.toObject(bt, Bt),
      state: ee.Message.getFieldWithDefault(Mt, 3, 0),
      stability: ee.Message.getFieldWithDefault(Mt, 4, 0),
      displayName: ee.Message.getFieldWithDefault(Mt, 5, ""),
      description: ee.Message.getFieldWithDefault(Mt, 6, ""),
      notes: ee.Message.getFieldWithDefault(Mt, 7, ""),
      goProtobufs:
        (Bt = Mt.getGoProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.GoProtobufs.toObject(
          bt,
          Bt,
        ),
      pythonProtobufs:
        (Bt = Mt.getPythonProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.PythonProtobufs.toObject(
          bt,
          Bt,
        ),
      nodeProtobufs:
        (Bt = Mt.getNodeProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.NodeProtobufs.toObject(
          bt,
          Bt,
        ),
      externalGoProtobufs:
        (Bt = Mt.getExternalGoProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.ExternalGoProtobufs.toObject(
          bt,
          Bt,
        ),
      externalPythonProtobufs:
        (Bt = Mt.getExternalPythonProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.ExternalPythonProtobufs.toObject(
          bt,
          Bt,
        ),
      externalNodeProtobufs:
        (Bt = Mt.getExternalNodeProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.ExternalNodeProtobufs.toObject(
          bt,
          Bt,
        ),
      gateways:
        (Bt = Mt.getGateways()) &&
        proto.alis.os.resources.products.v1.Artifact.Gateways.toObject(bt, Bt),
      externalGateways:
        (Bt = Mt.getExternalGateways()) &&
        proto.alis.os.resources.products.v1.Artifact.Gateways.toObject(bt, Bt),
      csharpProtobufs:
        (Bt = Mt.getCsharpProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.CSharpProtobufs.toObject(
          bt,
          Bt,
        ),
      cppProtobufs:
        (Bt = Mt.getCppProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.CppProtobufs.toObject(
          bt,
          Bt,
        ),
      dartProtobufs:
        (Bt = Mt.getDartProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.DartProtobufs.toObject(
          bt,
          Bt,
        ),
      javaProtobufs:
        (Bt = Mt.getJavaProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.JavaProtobufs.toObject(
          bt,
          Bt,
        ),
      kotlinProtobufs:
        (Bt = Mt.getKotlinProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.KotlinProtobufs.toObject(
          bt,
          Bt,
        ),
      objectiveCProtobufs:
        (Bt = Mt.getObjectiveCProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.ObjectiveCProtobufs.toObject(
          bt,
          Bt,
        ),
      phpProtobufs:
        (Bt = Mt.getPhpProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.PhpProtobufs.toObject(
          bt,
          Bt,
        ),
      rubyProtobufs:
        (Bt = Mt.getRubyProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.RubyProtobufs.toObject(
          bt,
          Bt,
        ),
      rProjectProtobufs:
        (Bt = Mt.getRProjectProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.RProjectProtobufs.toObject(
          bt,
          Bt,
        ),
      postmanCollection:
        (Bt = Mt.getPostmanCollection()) &&
        proto.alis.os.resources.products.v1.Artifact.PostmanCollection.toObject(
          bt,
          Bt,
        ),
      swagger:
        (Bt = Mt.getSwagger()) &&
        proto.alis.os.resources.products.v1.Artifact.Swagger.toObject(bt, Bt),
      markdown:
        (Bt = Mt.getMarkdown()) &&
        proto.alis.os.resources.products.v1.Artifact.Markdown.toObject(bt, Bt),
      html:
        (Bt = Mt.getHtml()) &&
        proto.alis.os.resources.products.v1.Artifact.Html.toObject(bt, Bt),
      bigquerySchemas:
        (Bt = Mt.getBigquerySchemas()) &&
        proto.alis.os.resources.products.v1.Artifact.BigQuerySchemas.toObject(
          bt,
          Bt,
        ),
      snowflakeSchemas:
        (Bt = Mt.getSnowflakeSchemas()) &&
        proto.alis.os.resources.products.v1.Artifact.SnowflakeSchemas.toObject(
          bt,
          Bt,
        ),
      gasProtobufs:
        (Bt = Mt.getGasProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.GasProtobufs.toObject(
          bt,
          Bt,
        ),
      externalGasProtobufs:
        (Bt = Mt.getExternalGasProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.ExternalGasProtobufs.toObject(
          bt,
          Bt,
        ),
      scriptEnvironments:
        (Bt = Mt.getScriptEnvironments()) &&
        proto.alis.os.resources.products.v1.Artifact.ScriptEnvironments.toObject(
          bt,
          Bt,
        ),
      msExcelAddins:
        (Bt = Mt.getMsExcelAddins()) &&
        proto.alis.os.resources.products.v1.Artifact.MsExcelAddIns.toObject(
          bt,
          Bt,
        ),
      rustProtobufs:
        (Bt = Mt.getRustProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.RustProtobufs.toObject(
          bt,
          Bt,
        ),
      swiftProtobufs:
        (Bt = Mt.getSwiftProtobufs()) &&
        proto.alis.os.resources.products.v1.Artifact.SwiftProtobufs.toObject(
          bt,
          Bt,
        ),
    };
  return (bt && (Ct.$jspbMessageInstance = Mt), Ct);
};

proto.alis.os.resources.products.v1.Organisation.toObject = function (bt, Mt) {
  var Bt,
    Ct = {
      migrated: ee.Message.getBooleanFieldWithDefault(Mt, 90, !1),
      name: ee.Message.getFieldWithDefault(Mt, 1, ""),
      displayName: ee.Message.getFieldWithDefault(Mt, 2, ""),
      logoUri: ee.Message.getFieldWithDefault(Mt, 26, ""),
      state: ee.Message.getFieldWithDefault(Mt, 3, 0),
      owner: ee.Message.getFieldWithDefault(Mt, 4, ""),
      envList: ee.Message.toObjectList(
        Mt.getEnvList(),
        proto.alis.os.resources.products.v1.Organisation.EnvEntry.toObject,
        bt,
      ),
      domain: ee.Message.getFieldWithDefault(Mt, 6, ""),
      googleProjectId: ee.Message.getFieldWithDefault(Mt, 7, ""),
      updateTime: (Bt = Mt.getUpdateTime()) && ct.Timestamp.toObject(bt, Bt),
      identityUri: ee.Message.getFieldWithDefault(Mt, 9, ""),
      billingAccount: ee.Message.getFieldWithDefault(Mt, 10, ""),
      folder: ee.Message.getFieldWithDefault(Mt, 11, ""),
      googleCustomerId: ee.Message.getFieldWithDefault(Mt, 12, ""),
      version: ee.Message.getFieldWithDefault(Mt, 13, ""),
      expireTime: (Bt = Mt.getExpireTime()) && ct.Timestamp.toObject(bt, Bt),
      ttl: (Bt = Mt.getTtl()) && xe.Duration.toObject(bt, Bt),
      description: ee.Message.getFieldWithDefault(Mt, 16, ""),
      aiEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 17, !1),
      gitProvider: ee.Message.getFieldWithDefault(Mt, 18, 0),
      lbEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 19, !1),
      runHash: ee.Message.getFieldWithDefault(Mt, 20, ""),
      createTime: (Bt = Mt.getCreateTime()) && ct.Timestamp.toObject(bt, Bt),
      managedDnsSwitchoverTime:
        (Bt = Mt.getManagedDnsSwitchoverTime()) &&
        ct.Timestamp.toObject(bt, Bt),
      googleProjectNumber: ee.Message.getFieldWithDefault(Mt, 23, ""),
      managedSpannerDbInstance: ee.Message.getFieldWithDefault(Mt, 24, ""),
      managedSpannerDbConfig:
        (Bt = Mt.getManagedSpannerDbConfig()) &&
        proto.alis.os.resources.products.v1.ManagedSpannerDbConfig.toObject(
          bt,
          Bt,
        ),
      managedSpannerInstanceConfig:
        (Bt = Mt.getManagedSpannerInstanceConfig()) &&
        proto.alis.os.resources.products.v1.ManagedSpannerInstanceConfig.toObject(
          bt,
          Bt,
        ),
      region: ee.Message.getFieldWithDefault(Mt, 28, ""),
    };
  return (bt && (Ct.$jspbMessageInstance = Mt), Ct);
};

proto.alis.os.resources.products.v1.Product.toObject = function (bt, Mt) {
  var Bt,
    Ct = {
      name: ee.Message.getFieldWithDefault(Mt, 1, ""),
      displayName: ee.Message.getFieldWithDefault(Mt, 2, ""),
      googleProjectId: ee.Message.getFieldWithDefault(Mt, 3, ""),
      state: ee.Message.getFieldWithDefault(Mt, 4, 0),
      owner: ee.Message.getFieldWithDefault(Mt, 5, ""),
      description: ee.Message.getFieldWithDefault(Mt, 6, ""),
      version: ee.Message.getFieldWithDefault(Mt, 7, ""),
      updateTime: (Bt = Mt.getUpdateTime()) && ct.Timestamp.toObject(bt, Bt),
      labelsList:
        (Bt = ee.Message.getRepeatedField(Mt, 9)) == null ? void 0 : Bt,
      overview: ee.Message.getFieldWithDefault(Mt, 10, ""),
      documentationUri: ee.Message.getFieldWithDefault(Mt, 11, ""),
      availability: ee.Message.getFieldWithDefault(Mt, 12, 0),
      dependenciesList: ee.Message.toObjectList(
        Mt.getDependenciesList(),
        proto.alis.os.resources.products.v1.Product.Dependency.toObject,
        bt,
      ),
      baseUri: ee.Message.getFieldWithDefault(Mt, 14, ""),
      billingAccount: ee.Message.getFieldWithDefault(Mt, 15, ""),
      documentation:
        (Bt = Mt.getDocumentation()) &&
        proto.alis.os.resources.products.v1.Product.Documentation.toObject(
          bt,
          Bt,
        ),
      expireTime: (Bt = Mt.getExpireTime()) && ct.Timestamp.toObject(bt, Bt),
      ttl: (Bt = Mt.getTtl()) && xe.Duration.toObject(bt, Bt),
      managedTerraform: ee.Message.getBooleanFieldWithDefault(Mt, 19, !1),
      buildConfig:
        (Bt = Mt.getBuildConfig()) &&
        proto.alis.os.resources.products.v1.Product.BuildConfig.toObject(
          bt,
          Bt,
        ),
      googleDocDescriptionUri: ee.Message.getFieldWithDefault(Mt, 21, ""),
      landingPage:
        (Bt = Mt.getLandingPage()) &&
        proto.alis.os.resources.products.v1.Product.LandingPage.toObject(
          bt,
          Bt,
        ),
      fastBuilds: ee.Message.getBooleanFieldWithDefault(Mt, 23, !1),
      runHash: ee.Message.getFieldWithDefault(Mt, 24, ""),
      managedSpannerDbInstance: ee.Message.getFieldWithDefault(Mt, 25, ""),
      googleProjectNumber: ee.Message.getFieldWithDefault(Mt, 26, ""),
      managedSpannerDbConfig:
        (Bt = Mt.getManagedSpannerDbConfig()) &&
        proto.alis.os.resources.products.v1.ManagedSpannerDbConfig.toObject(
          bt,
          Bt,
        ),
    };
  return (bt && (Ct.$jspbMessageInstance = Mt), Ct);
};

proto.alis.os.resources.products.v1.ProductDeployment.toObject = function (
  bt,
  Mt,
) {
  var Bt,
    Ct = {
      name: ee.Message.getFieldWithDefault(Mt, 1, ""),
      googleProjectId: ee.Message.getFieldWithDefault(Mt, 2, ""),
      environment: ee.Message.getFieldWithDefault(Mt, 3, 0),
      state: ee.Message.getFieldWithDefault(Mt, 4, 0),
      owner: ee.Message.getFieldWithDefault(Mt, 5, ""),
      version: ee.Message.getFieldWithDefault(Mt, 6, ""),
      updateTime: (Bt = Mt.getUpdateTime()) && ct.Timestamp.toObject(bt, Bt),
      displayName: ee.Message.getFieldWithDefault(Mt, 8, ""),
      envsList: ee.Message.toObjectList(
        Mt.getEnvsList(),
        proto.alis.os.resources.products.v1.Product.Env.toObject,
        bt,
      ),
      infrastructureUri: ee.Message.getFieldWithDefault(Mt, 10, ""),
      billingAccount: ee.Message.getFieldWithDefault(Mt, 15, ""),
      gatewayEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 16, !1),
      workflowsEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 17, !1),
      expireTime: (Bt = Mt.getExpireTime()) && ct.Timestamp.toObject(bt, Bt),
      ttl: (Bt = Mt.getTtl()) && xe.Duration.toObject(bt, Bt),
      gatewaysList: ee.Message.toObjectList(
        Mt.getGatewaysList(),
        proto.alis.os.resources.products.v1.ProductDeployment.Gateway.toObject,
        bt,
      ),
      serviceAccount: ee.Message.getFieldWithDefault(Mt, 21, ""),
      consoleUri: ee.Message.getFieldWithDefault(Mt, 22, ""),
      runHash: ee.Message.getFieldWithDefault(Mt, 23, ""),
      region: ee.Message.getFieldWithDefault(Mt, 24, ""),
      managedSpannerDbInstance: ee.Message.getFieldWithDefault(Mt, 25, ""),
      flowsEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 26, !1),
      operationsEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 27, !1),
      googleProjectNumber: ee.Message.getFieldWithDefault(Mt, 28, ""),
      oauthConfig: (Bt = Mt.getOauthConfig()) && mt.Any.toObject(bt, Bt),
      iamConfig: (Bt = Mt.getIamConfig()) && rt.IamConfig.toObject(bt, Bt),
      managedSpannerDbConfig:
        (Bt = Mt.getManagedSpannerDbConfig()) &&
        proto.alis.os.resources.products.v1.ManagedSpannerDbConfig.toObject(
          bt,
          Bt,
        ),
      guidesConfig:
        (Bt = Mt.getGuidesConfig()) &&
        proto.alis.os.resources.products.v1.ProductDeployment.GuidesConfig.toObject(
          bt,
          Bt,
        ),
      issuesConfig:
        (Bt = Mt.getIssuesConfig()) &&
        proto.alis.os.resources.products.v1.ProductDeployment.IssuesConfig.toObject(
          bt,
          Bt,
        ),
      supportConfig:
        (Bt = Mt.getSupportConfig()) &&
        proto.alis.os.resources.products.v1.ProductDeployment.SupportConfig.toObject(
          bt,
          Bt,
        ),
    };
  return (bt && (Ct.$jspbMessageInstance = Mt), Ct);
};

proto.alis.os.resources.products.v1.ManagedSpannerInstanceConfig.toObject =
  function (bt, Mt) {
    var Bt = {
      enabled: ee.Message.getBooleanFieldWithDefault(Mt, 1, !1),
      instance: ee.Message.getFieldWithDefault(Mt, 2, ""),
      config: ee.Message.getFieldWithDefault(Mt, 3, ""),
      displayName: ee.Message.getFieldWithDefault(Mt, 4, ""),
      processingUnits: ee.Message.getFieldWithDefault(Mt, 5, 0),
    };
    return (bt && (Bt.$jspbMessageInstance = Mt), Bt);
  };

proto.alis.open.support.v1.Issue.toObject = function (ut, xe) {
  var it,
    lt = {
      name: ee.Message.getFieldWithDefault(xe, 1, ""),
      displayName: ee.Message.getFieldWithDefault(xe, 2, ""),
      descriptionList: ee.Message.toObjectList(
        xe.getDescriptionList(),
        proto.alis.open.support.v1.Issue.ContentBlock.toObject,
        ut,
      ),
      category: ee.Message.getFieldWithDefault(xe, 4, 0),
      type: ee.Message.getFieldWithDefault(xe, 5, 0),
      state: ee.Message.getFieldWithDefault(xe, 6, 0),
      reporter:
        (it = xe.getReporter()) &&
        proto.alis.open.support.v1.Issue.User.toObject(ut, it),
      assignee:
        (it = xe.getAssignee()) &&
        proto.alis.open.support.v1.Issue.User.toObject(ut, it),
      visibility: ee.Message.getFieldWithDefault(xe, 9, 0),
      createTime: (it = xe.getCreateTime()) && ct.Timestamp.toObject(ut, it),
      updateTime: (it = xe.getUpdateTime()) && ct.Timestamp.toObject(ut, it),
    };
  return (ut && (lt.$jspbMessageInstance = xe), lt);
};

proto.alis.open.iam.v1.Group.toObject = function (ct, ut) {
  var xe,
    it = {
      name: ee.Message.getFieldWithDefault(ut, 1, ""),
      displayName: ee.Message.getFieldWithDefault(ut, 2, ""),
      description: ee.Message.getFieldWithDefault(ut, 3, ""),
      updateTime: (xe = ut.getUpdateTime()) && ft.Timestamp.toObject(ct, xe),
      createTime: (xe = ut.getCreateTime()) && ft.Timestamp.toObject(ct, xe),
    };
  return (ct && (it.$jspbMessageInstance = ut), it);
};

proto.alis.os.accounts.v1.Account.toObject = function (it, lt) {
  var rt,
    mt = {
      name: ee.Message.getFieldWithDefault(lt, 1, ""),
      displayName: ee.Message.getFieldWithDefault(lt, 2, ""),
      description: ee.Message.getFieldWithDefault(lt, 3, ""),
      buildPartner: ee.Message.getFieldWithDefault(lt, 4, ""),
      buildPartnerPrimaryContact: ee.Message.getFieldWithDefault(lt, 19, ""),
      consolidateInvoices: ee.Message.getBooleanFieldWithDefault(lt, 45, !1),
      countryCode: ee.Message.getFieldWithDefault(lt, 5, ""),
      vendor: ee.Message.getFieldWithDefault(lt, 6, 0),
      poNumbers: ee.Message.getFieldWithDefault(lt, 10, ""),
      customLineItemsList: ee.Message.toObjectList(
        lt.getCustomLineItemsList(),
        proto.alis.os.accounts.v1.Account.CustomLineItem.toObject,
        it,
      ),
      ideatePlan: ee.Message.getFieldWithDefault(lt, 11, 0),
      buildPlan: ee.Message.getFieldWithDefault(lt, 12, 0),
      managePlan: ee.Message.getFieldWithDefault(lt, 13, 0),
      ideatePlanChanges:
        (rt = lt.getIdeatePlanChanges()) &&
        proto.alis.os.accounts.v1.Account.PlanChanges.toObject(it, rt),
      buildPlanChanges:
        (rt = lt.getBuildPlanChanges()) &&
        proto.alis.os.accounts.v1.Account.PlanChanges.toObject(it, rt),
      managePlanChanges:
        (rt = lt.getManagePlanChanges()) &&
        proto.alis.os.accounts.v1.Account.PlanChanges.toObject(it, rt),
      billingInformation:
        (rt = lt.getBillingInformation()) &&
        proto.alis.os.accounts.v1.Account.BillingInformation.toObject(it, rt),
      archived: ee.Message.getBooleanFieldWithDefault(lt, 29, !1),
      associatedDomainsList:
        (rt = ee.Message.getRepeatedField(lt, 20)) == null ? void 0 : rt,
      websiteDomain: ee.Message.getFieldWithDefault(lt, 21, ""),
      individualAccount: ee.Message.getBooleanFieldWithDefault(lt, 22, !1),
      attribution:
        (rt = lt.getAttribution()) &&
        proto.alis.os.accounts.v1.Account.Attribution.toObject(it, rt),
      platformAccountManagement:
        (rt = lt.getPlatformAccountManagement()) &&
        proto.alis.os.accounts.v1.Account.PlatformAccountManagement.toObject(
          it,
          rt,
        ),
      buildPartnerAccountManagement:
        (rt = lt.getBuildPartnerAccountManagement()) &&
        proto.alis.os.accounts.v1.Account.BuildPartnerAccountManagement.toObject(
          it,
          rt,
        ),
      sandboxProduct: ee.Message.getFieldWithDefault(lt, 50, ""),
      gcpBillingAccountId: ee.Message.getFieldWithDefault(lt, 51, ""),
      ideateTrialExpiryTime:
        (rt = lt.getIdeateTrialExpiryTime()) && ut.Timestamp.toObject(it, rt),
      buildTrialExpiryTime:
        (rt = lt.getBuildTrialExpiryTime()) && ut.Timestamp.toObject(it, rt),
      manageTrialExpiryTime:
        (rt = lt.getManageTrialExpiryTime()) && ut.Timestamp.toObject(it, rt),
      createTime: (rt = lt.getCreateTime()) && ut.Timestamp.toObject(it, rt),
      updateTime: (rt = lt.getUpdateTime()) && ut.Timestamp.toObject(it, rt),
    };
  return (it && (mt.$jspbMessageInstance = lt), mt);
};

proto.alis.os.accounts.v1.MaskedAccount.toObject = function (it, lt) {
  var rt = {
    name: ee.Message.getFieldWithDefault(lt, 1, ""),
    displayName: ee.Message.getFieldWithDefault(lt, 2, ""),
    description: ee.Message.getFieldWithDefault(lt, 3, ""),
    buildPartner: ee.Message.getFieldWithDefault(lt, 4, ""),
    countryCode: ee.Message.getFieldWithDefault(lt, 5, ""),
    vendor: ee.Message.getFieldWithDefault(lt, 6, 0),
    websiteDomain: ee.Message.getFieldWithDefault(lt, 7, ""),
  };
  return (it && (rt.$jspbMessageInstance = lt), rt);
};

proto.alis.os.resources.solutions.v1.Solution.toObject = function (rt, mt) {
  var St,
    bt = {
      name: ee.Message.getFieldWithDefault(mt, 1, ""),
      displayName: ee.Message.getFieldWithDefault(mt, 2, ""),
      ideate:
        (St = mt.getIdeate()) &&
        proto.alis.os.resources.solutions.v1.Solution.Ideate.toObject(rt, St),
      context:
        (St = mt.getContext()) &&
        proto.alis.os.resources.solutions.v1.Solution.Context.toObject(rt, St),
      deliverablesList: ee.Message.toObjectList(
        mt.getDeliverablesList(),
        proto.alis.os.resources.solutions.v1.Solution.Deliverable.toObject,
        rt,
      ),
      scope:
        (St = mt.getScope()) &&
        proto.alis.os.resources.solutions.v1.Solution.Scope.toObject(rt, St),
      team:
        (St = mt.getTeam()) &&
        proto.alis.os.resources.solutions.v1.Solution.Team.toObject(rt, St),
      billing:
        (St = mt.getBilling()) &&
        proto.alis.os.resources.solutions.v1.Solution.Billing.toObject(rt, St),
      stage: ee.Message.getFieldWithDefault(mt, 5, 0),
      attachmentsList: ee.Message.toObjectList(
        mt.getAttachmentsList(),
        proto.alis.os.resources.solutions.v1.Solution.Attachment.toObject,
        rt,
      ),
      builder: ee.Message.getFieldWithDefault(mt, 7, ""),
      approval:
        (St = mt.getApproval()) &&
        proto.alis.os.resources.solutions.v1.Solution.Approval.toObject(rt, St),
      acceptance:
        (St = mt.getAcceptance()) &&
        proto.alis.os.resources.solutions.v1.Solution.Acceptance.toObject(
          rt,
          St,
        ),
      state: ee.Message.getFieldWithDefault(mt, 9, 0),
      proposalUri: ee.Message.getFieldWithDefault(mt, 10, ""),
      account: ee.Message.getFieldWithDefault(mt, 11, ""),
      productsList:
        (St = ee.Message.getRepeatedField(mt, 13)) == null ? void 0 : St,
      isProofOfConcept: ee.Message.getBooleanFieldWithDefault(mt, 14, !1),
      targetCommencementDate:
        (St = mt.getTargetCommencementDate()) && it.Date.toObject(rt, St),
      dueDate: (St = mt.getDueDate()) && it.Date.toObject(rt, St),
      createTime: (St = mt.getCreateTime()) && ut.Timestamp.toObject(rt, St),
      updateTime: (St = mt.getUpdateTime()) && ut.Timestamp.toObject(rt, St),
      deployedTime:
        (St = mt.getDeployedTime()) && ut.Timestamp.toObject(rt, St),
    };
  return (rt && (bt.$jspbMessageInstance = mt), bt);
};

proto.alis.os.resources.solutions.v1.Activity.Progress.Team.Stakeholder.toObject =
  function (rt, mt) {
    var St = {
      builder: ee.Message.getFieldWithDefault(mt, 1, ""),
      user: ee.Message.getFieldWithDefault(mt, 5, ""),
      displayName: ee.Message.getFieldWithDefault(mt, 2, ""),
      profilePictureUri: ee.Message.getFieldWithDefault(mt, 3, ""),
      email: ee.Message.getFieldWithDefault(mt, 4, ""),
    };
    return (rt && (St.$jspbMessageInstance = mt), St);
  };

proto.alis.os.solutions.v2.Solution.toObject = function (it, lt) {
  var rt,
    mt = {
      name: ee.Message.getFieldWithDefault(lt, 1, ""),
      displayName: ee.Message.getFieldWithDefault(lt, 2, ""),
      status: ee.Message.getFieldWithDefault(lt, 3, 0),
      summary: ee.Message.getFieldWithDefault(lt, 4, ""),
      ideate:
        (rt = lt.getIdeate()) &&
        proto.alis.os.solutions.v2.Solution.Ideate.toObject(it, rt),
      productsList:
        (rt = ee.Message.getRepeatedField(lt, 6)) == null ? void 0 : rt,
      account: ee.Message.getFieldWithDefault(lt, 14, ""),
      modulesEnabledList:
        (rt = ee.Message.getRepeatedField(lt, 7)) == null ? void 0 : rt,
      etag: ee.Message.getFieldWithDefault(lt, 94, ""),
      commencementTime:
        (rt = lt.getCommencementTime()) && ut.Timestamp.toObject(it, rt),
      targetCompletionDate:
        (rt = lt.getTargetCompletionDate()) && xe.Date.toObject(it, rt),
      completionTime:
        (rt = lt.getCompletionTime()) && ut.Timestamp.toObject(it, rt),
      createTime: (rt = lt.getCreateTime()) && ut.Timestamp.toObject(it, rt),
      updateTime: (rt = lt.getUpdateTime()) && ut.Timestamp.toObject(it, rt),
      deleteTime: (rt = lt.getDeleteTime()) && ut.Timestamp.toObject(it, rt),
    };
  return (it && (mt.$jspbMessageInstance = lt), mt);
};
