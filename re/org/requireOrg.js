function requireOrganisation_pb() {
  return (
    hasRequiredOrganisation_pb ||
      ((hasRequiredOrganisation_pb = 1),
      (function (ne) {
        var ee = requireGoogleProtobuf$1(),
          te = ee,
          vt = globalThis,
          gt = requireTimestamp_pb$1();
        te.object.extend(proto, gt);
        var ht = requireField_mask_pb();
        te.object.extend(proto, ht);
        var pt = requirePolicy_pb();
        te.object.extend(proto, pt);
        var Rt = requireIam_policy_pb();
        te.object.extend(proto, Rt);
        var yt = requireIam_pb$1();
        te.object.extend(proto, yt);
        var ft = requireCommon_pb();
        te.object.extend(proto, ft);
        var ct = requireOperations_pb$1();
        te.object.extend(proto, ct);
        var ut = requireOptions_pb();
        (te.object.extend(proto, ut),
          te.exportSymbol(
            "proto.alis.os.products.v1.BatchGetOrganisationsRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.BatchGetOrganisationsResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.CreateOrganisationRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.DeleteOrganisationMetadata",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.DeleteOrganisationRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.DeleteOrganisationResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.DeployOrganisationMetadata",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.DeployOrganisationRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.DeployOrganisationResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.GetOrganisationRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.ListOrganisationsRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.ListOrganisationsResponse",
            null,
            vt,
          ),
          te.exportSymbol("proto.alis.os.products.v1.Loadbalancer", null, vt),
          te.exportSymbol("proto.alis.os.products.v1.Organisation", null, vt),
          te.exportSymbol(
            "proto.alis.os.products.v1.Organisation.Github",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.Organisation.State",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.SpannerInstance",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.UpdateOrganisationRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.ValidateLzBillingAccountRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.ValidateLzBillingAccountResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.ValidateLzFolderRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.products.v1.ValidateLzFolderResponse",
            null,
            vt,
          ),
          (proto.alis.os.products.v1.ValidateLzFolderRequest = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.ValidateLzFolderRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.ValidateLzFolderRequest.displayName =
              "proto.alis.os.products.v1.ValidateLzFolderRequest"),
          (proto.alis.os.products.v1.ValidateLzFolderResponse = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.ValidateLzFolderResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.ValidateLzFolderResponse.displayName =
              "proto.alis.os.products.v1.ValidateLzFolderResponse"),
          (proto.alis.os.products.v1.ValidateLzBillingAccountRequest =
            function (xe) {
              ee.Message.initialize(this, xe, 0, -1, null, null);
            }),
          te.inherits(
            proto.alis.os.products.v1.ValidateLzBillingAccountRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.displayName =
              "proto.alis.os.products.v1.ValidateLzBillingAccountRequest"),
          (proto.alis.os.products.v1.ValidateLzBillingAccountResponse =
            function (xe) {
              ee.Message.initialize(this, xe, 0, -1, null, null);
            }),
          te.inherits(
            proto.alis.os.products.v1.ValidateLzBillingAccountResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.ValidateLzBillingAccountResponse.displayName =
              "proto.alis.os.products.v1.ValidateLzBillingAccountResponse"),
          (proto.alis.os.products.v1.Organisation = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(proto.alis.os.products.v1.Organisation, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.Organisation.displayName =
              "proto.alis.os.products.v1.Organisation"),
          (proto.alis.os.products.v1.Organisation.Github = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.Organisation.Github,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.Organisation.Github.displayName =
              "proto.alis.os.products.v1.Organisation.Github"),
          (proto.alis.os.products.v1.SpannerInstance = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(proto.alis.os.products.v1.SpannerInstance, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.SpannerInstance.displayName =
              "proto.alis.os.products.v1.SpannerInstance"),
          (proto.alis.os.products.v1.Loadbalancer = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(proto.alis.os.products.v1.Loadbalancer, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.Loadbalancer.displayName =
              "proto.alis.os.products.v1.Loadbalancer"),
          (proto.alis.os.products.v1.GetOrganisationRequest = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.GetOrganisationRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.GetOrganisationRequest.displayName =
              "proto.alis.os.products.v1.GetOrganisationRequest"),
          (proto.alis.os.products.v1.CreateOrganisationRequest = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.CreateOrganisationRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.CreateOrganisationRequest.displayName =
              "proto.alis.os.products.v1.CreateOrganisationRequest"),
          (proto.alis.os.products.v1.UpdateOrganisationRequest = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.UpdateOrganisationRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.UpdateOrganisationRequest.displayName =
              "proto.alis.os.products.v1.UpdateOrganisationRequest"),
          (proto.alis.os.products.v1.DeleteOrganisationRequest = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.DeleteOrganisationRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.DeleteOrganisationRequest.displayName =
              "proto.alis.os.products.v1.DeleteOrganisationRequest"),
          (proto.alis.os.products.v1.ListOrganisationsRequest = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.ListOrganisationsRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.ListOrganisationsRequest.displayName =
              "proto.alis.os.products.v1.ListOrganisationsRequest"),
          (proto.alis.os.products.v1.ListOrganisationsResponse = function (xe) {
            ee.Message.initialize(
              this,
              xe,
              0,
              -1,
              proto.alis.os.products.v1.ListOrganisationsResponse
                .repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.os.products.v1.ListOrganisationsResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.ListOrganisationsResponse.displayName =
              "proto.alis.os.products.v1.ListOrganisationsResponse"),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest = function (
            xe,
          ) {
            ee.Message.initialize(
              this,
              xe,
              0,
              -1,
              proto.alis.os.products.v1.BatchGetOrganisationsRequest
                .repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.os.products.v1.BatchGetOrganisationsRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.BatchGetOrganisationsRequest.displayName =
              "proto.alis.os.products.v1.BatchGetOrganisationsRequest"),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse = function (
            xe,
          ) {
            ee.Message.initialize(
              this,
              xe,
              0,
              -1,
              proto.alis.os.products.v1.BatchGetOrganisationsResponse
                .repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.os.products.v1.BatchGetOrganisationsResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.BatchGetOrganisationsResponse.displayName =
              "proto.alis.os.products.v1.BatchGetOrganisationsResponse"),
          (proto.alis.os.products.v1.DeployOrganisationRequest = function (xe) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.DeployOrganisationRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.DeployOrganisationRequest.displayName =
              "proto.alis.os.products.v1.DeployOrganisationRequest"),
          (proto.alis.os.products.v1.DeployOrganisationMetadata = function (
            xe,
          ) {
            ee.Message.initialize(
              this,
              xe,
              0,
              -1,
              proto.alis.os.products.v1.DeployOrganisationMetadata
                .repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.os.products.v1.DeployOrganisationMetadata,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.DeployOrganisationMetadata.displayName =
              "proto.alis.os.products.v1.DeployOrganisationMetadata"),
          (proto.alis.os.products.v1.DeployOrganisationResponse = function (
            xe,
          ) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.DeployOrganisationResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.DeployOrganisationResponse.displayName =
              "proto.alis.os.products.v1.DeployOrganisationResponse"),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata = function (
            xe,
          ) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.DeleteOrganisationMetadata,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.DeleteOrganisationMetadata.displayName =
              "proto.alis.os.products.v1.DeleteOrganisationMetadata"),
          (proto.alis.os.products.v1.DeleteOrganisationResponse = function (
            xe,
          ) {
            ee.Message.initialize(this, xe, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.products.v1.DeleteOrganisationResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.DeleteOrganisationResponse.displayName =
              "proto.alis.os.products.v1.DeleteOrganisationResponse"),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest =
            function (xe) {
              ee.Message.initialize(this, xe, 0, -1, null, null);
            }),
          te.inherits(
            proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.displayName =
              "proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest"),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.ValidateLzFolderRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.ValidateLzFolderRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.ValidateLzFolderRequest.toObject =
              function (xe, it) {
                var lt = {
                  folderId: ee.Message.getFieldWithDefault(it, 1, ""),
                };
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.ValidateLzFolderRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.ValidateLzFolderRequest();
              return proto.alis.os.products.v1.ValidateLzFolderRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.ValidateLzFolderRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                if (lt === 1) {
                  var rt = it.readStringRequireUtf8();
                  xe.setFolderId(rt);
                } else it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.ValidateLzFolderRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.ValidateLzFolderRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.ValidateLzFolderRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getFolderId()), lt.length > 0 && it.writeString(1, lt));
            }),
          (proto.alis.os.products.v1.ValidateLzFolderRequest.prototype.getFolderId =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.ValidateLzFolderRequest.prototype.setFolderId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.ValidateLzFolderResponse.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.ValidateLzFolderResponse.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.ValidateLzFolderResponse.toObject =
              function (xe, it) {
                var lt = {};
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.ValidateLzFolderResponse.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.ValidateLzFolderResponse();
              return proto.alis.os.products.v1.ValidateLzFolderResponse.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.ValidateLzFolderResponse.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.ValidateLzFolderResponse.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.ValidateLzFolderResponse.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.ValidateLzFolderResponse.serializeBinaryToWriter =
            function (xe, it) {}),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.ValidateLzBillingAccountRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.ValidateLzBillingAccountRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.toObject =
              function (xe, it) {
                var lt = {
                  billingAccountId: ee.Message.getFieldWithDefault(it, 1, ""),
                };
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt =
                  new proto.alis.os.products.v1.ValidateLzBillingAccountRequest();
              return proto.alis.os.products.v1.ValidateLzBillingAccountRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                if (lt === 1) {
                  var rt = it.readStringRequireUtf8();
                  xe.setBillingAccountId(rt);
                } else it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.ValidateLzBillingAccountRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getBillingAccountId()),
                lt.length > 0 && it.writeString(1, lt));
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.prototype.getBillingAccountId =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountRequest.prototype.setBillingAccountId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.ValidateLzBillingAccountResponse.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.ValidateLzBillingAccountResponse.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.ValidateLzBillingAccountResponse.toObject =
              function (xe, it) {
                var lt = {};
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.ValidateLzBillingAccountResponse.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt =
                  new proto.alis.os.products.v1.ValidateLzBillingAccountResponse();
              return proto.alis.os.products.v1.ValidateLzBillingAccountResponse.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountResponse.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountResponse.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.ValidateLzBillingAccountResponse.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.ValidateLzBillingAccountResponse.serializeBinaryToWriter =
            function (xe, it) {}),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.Organisation.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.Organisation.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.Organisation.toObject = function (
              xe,
              it,
            ) {
              var lt,
                rt = {
                  name: ee.Message.getFieldWithDefault(it, 1, ""),
                  displayName: ee.Message.getFieldWithDefault(it, 2, ""),
                  description: ee.Message.getFieldWithDefault(it, 3, ""),
                  logo: ee.Message.getFieldWithDefault(it, 4, ""),
                  googleProject:
                    (lt = it.getGoogleProject()) &&
                    ft.GoogleProject.toObject(xe, lt),
                  bucketsDomain: ee.Message.getFieldWithDefault(it, 6, ""),
                  packagesDomain: ee.Message.getFieldWithDefault(it, 10, ""),
                  account: ee.Message.getFieldWithDefault(it, 12, ""),
                  spannerInstance:
                    (lt = it.getSpannerInstance()) &&
                    proto.alis.os.products.v1.SpannerInstance.toObject(xe, lt),
                  serviceAccount:
                    (lt = it.getServiceAccount()) &&
                    ft.ServiceAccount.toObject(xe, lt),
                  gitRepo:
                    (lt = it.getGitRepo()) && ft.GitRepo.toObject(xe, lt),
                  loadbalancer:
                    (lt = it.getLoadbalancer()) &&
                    proto.alis.os.products.v1.Loadbalancer.toObject(xe, lt),
                  state: ee.Message.getFieldWithDefault(it, 21, 0),
                  deployOperation: ee.Message.getFieldWithDefault(it, 22, ""),
                  lastSuccessfulDeployTime:
                    (lt = it.getLastSuccessfulDeployTime()) &&
                    gt.Timestamp.toObject(xe, lt),
                  workforceFederationPoolId: ee.Message.getFieldWithDefault(
                    it,
                    31,
                    "",
                  ),
                  workforceFederationMicrosoftProviderId:
                    ee.Message.getFieldWithDefault(it, 32, ""),
                  github:
                    (lt = it.getGithub()) &&
                    proto.alis.os.products.v1.Organisation.Github.toObject(
                      xe,
                      lt,
                    ),
                  createTime:
                    (lt = it.getCreateTime()) && gt.Timestamp.toObject(xe, lt),
                  updateTime:
                    (lt = it.getUpdateTime()) && gt.Timestamp.toObject(xe, lt),
                };
              return (xe && (rt.$jspbMessageInstance = it), rt);
            })),
          (proto.alis.os.products.v1.Organisation.deserializeBinary = function (
            xe,
          ) {
            var it = new ee.BinaryReader(xe),
              lt = new proto.alis.os.products.v1.Organisation();
            return proto.alis.os.products.v1.Organisation.deserializeBinaryFromReader(
              lt,
              it,
            );
          }),
          (proto.alis.os.products.v1.Organisation.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.setName(rt);
                    break;
                  case 2:
                    var rt = it.readStringRequireUtf8();
                    xe.setDisplayName(rt);
                    break;
                  case 3:
                    var rt = it.readStringRequireUtf8();
                    xe.setDescription(rt);
                    break;
                  case 4:
                    var rt = it.readStringRequireUtf8();
                    xe.setLogo(rt);
                    break;
                  case 5:
                    var rt = new ft.GoogleProject();
                    (it.readMessage(
                      rt,
                      ft.GoogleProject.deserializeBinaryFromReader,
                    ),
                      xe.setGoogleProject(rt));
                    break;
                  case 6:
                    var rt = it.readStringRequireUtf8();
                    xe.setBucketsDomain(rt);
                    break;
                  case 10:
                    var rt = it.readStringRequireUtf8();
                    xe.setPackagesDomain(rt);
                    break;
                  case 12:
                    var rt = it.readStringRequireUtf8();
                    xe.setAccount(rt);
                    break;
                  case 7:
                    var rt = new proto.alis.os.products.v1.SpannerInstance();
                    (it.readMessage(
                      rt,
                      proto.alis.os.products.v1.SpannerInstance
                        .deserializeBinaryFromReader,
                    ),
                      xe.setSpannerInstance(rt));
                    break;
                  case 8:
                    var rt = new ft.ServiceAccount();
                    (it.readMessage(
                      rt,
                      ft.ServiceAccount.deserializeBinaryFromReader,
                    ),
                      xe.setServiceAccount(rt));
                    break;
                  case 9:
                    var rt = new ft.GitRepo();
                    (it.readMessage(rt, ft.GitRepo.deserializeBinaryFromReader),
                      xe.setGitRepo(rt));
                    break;
                  case 11:
                    var rt = new proto.alis.os.products.v1.Loadbalancer();
                    (it.readMessage(
                      rt,
                      proto.alis.os.products.v1.Loadbalancer
                        .deserializeBinaryFromReader,
                    ),
                      xe.setLoadbalancer(rt));
                    break;
                  case 21:
                    var rt = it.readEnum();
                    xe.setState(rt);
                    break;
                  case 22:
                    var rt = it.readStringRequireUtf8();
                    xe.setDeployOperation(rt);
                    break;
                  case 23:
                    var rt = new gt.Timestamp();
                    (it.readMessage(
                      rt,
                      gt.Timestamp.deserializeBinaryFromReader,
                    ),
                      xe.setLastSuccessfulDeployTime(rt));
                    break;
                  case 31:
                    var rt = it.readStringRequireUtf8();
                    xe.setWorkforceFederationPoolId(rt);
                    break;
                  case 32:
                    var rt = it.readStringRequireUtf8();
                    xe.setWorkforceFederationMicrosoftProviderId(rt);
                    break;
                  case 41:
                    var rt =
                      new proto.alis.os.products.v1.Organisation.Github();
                    (it.readMessage(
                      rt,
                      proto.alis.os.products.v1.Organisation.Github
                        .deserializeBinaryFromReader,
                    ),
                      xe.setGithub(rt));
                    break;
                  case 98:
                    var rt = new gt.Timestamp();
                    (it.readMessage(
                      rt,
                      gt.Timestamp.deserializeBinaryFromReader,
                    ),
                      xe.setCreateTime(rt));
                    break;
                  case 99:
                    var rt = new gt.Timestamp();
                    (it.readMessage(
                      rt,
                      gt.Timestamp.deserializeBinaryFromReader,
                    ),
                      xe.setUpdateTime(rt));
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.Organisation.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.Organisation.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getName()),
                lt.length > 0 && it.writeString(1, lt),
                (lt = xe.getDisplayName()),
                lt.length > 0 && it.writeString(2, lt),
                (lt = xe.getDescription()),
                lt.length > 0 && it.writeString(3, lt),
                (lt = xe.getLogo()),
                lt.length > 0 && it.writeString(4, lt),
                (lt = xe.getGoogleProject()),
                lt != null &&
                  it.writeMessage(
                    5,
                    lt,
                    ft.GoogleProject.serializeBinaryToWriter,
                  ),
                (lt = xe.getBucketsDomain()),
                lt.length > 0 && it.writeString(6, lt),
                (lt = xe.getPackagesDomain()),
                lt.length > 0 && it.writeString(10, lt),
                (lt = xe.getAccount()),
                lt.length > 0 && it.writeString(12, lt),
                (lt = xe.getSpannerInstance()),
                lt != null &&
                  it.writeMessage(
                    7,
                    lt,
                    proto.alis.os.products.v1.SpannerInstance
                      .serializeBinaryToWriter,
                  ),
                (lt = xe.getServiceAccount()),
                lt != null &&
                  it.writeMessage(
                    8,
                    lt,
                    ft.ServiceAccount.serializeBinaryToWriter,
                  ),
                (lt = xe.getGitRepo()),
                lt != null &&
                  it.writeMessage(9, lt, ft.GitRepo.serializeBinaryToWriter),
                (lt = xe.getLoadbalancer()),
                lt != null &&
                  it.writeMessage(
                    11,
                    lt,
                    proto.alis.os.products.v1.Loadbalancer
                      .serializeBinaryToWriter,
                  ),
                (lt = xe.getState()),
                lt !== 0 && it.writeEnum(21, lt),
                (lt = xe.getDeployOperation()),
                lt.length > 0 && it.writeString(22, lt),
                (lt = xe.getLastSuccessfulDeployTime()),
                lt != null &&
                  it.writeMessage(23, lt, gt.Timestamp.serializeBinaryToWriter),
                (lt = xe.getWorkforceFederationPoolId()),
                lt.length > 0 && it.writeString(31, lt),
                (lt = xe.getWorkforceFederationMicrosoftProviderId()),
                lt.length > 0 && it.writeString(32, lt),
                (lt = xe.getGithub()),
                lt != null &&
                  it.writeMessage(
                    41,
                    lt,
                    proto.alis.os.products.v1.Organisation.Github
                      .serializeBinaryToWriter,
                  ),
                (lt = xe.getCreateTime()),
                lt != null &&
                  it.writeMessage(98, lt, gt.Timestamp.serializeBinaryToWriter),
                (lt = xe.getUpdateTime()),
                lt != null &&
                  it.writeMessage(
                    99,
                    lt,
                    gt.Timestamp.serializeBinaryToWriter,
                  ));
            }),
          (proto.alis.os.products.v1.Organisation.State = {
            STATE_UNSPECIFIED: 0,
            ACTIVE: 1,
            FAILED: 2,
            CREATING: 3,
            UPDATING: 4,
            DESTROYING: 5,
            DELETING: 6,
          }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.Organisation.Github.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.Organisation.Github.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.Organisation.Github.toObject = function (
              xe,
              it,
            ) {
              var lt = {
                organisationId: ee.Message.getFieldWithDefault(it, 1, ""),
                accessToken: ee.Message.getFieldWithDefault(it, 2, ""),
              };
              return (xe && (lt.$jspbMessageInstance = it), lt);
            })),
          (proto.alis.os.products.v1.Organisation.Github.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.Organisation.Github();
              return proto.alis.os.products.v1.Organisation.Github.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.Organisation.Github.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.setOrganisationId(rt);
                    break;
                  case 2:
                    var rt = it.readStringRequireUtf8();
                    xe.setAccessToken(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.Organisation.Github.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.Organisation.Github.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.Organisation.Github.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisationId()),
                lt.length > 0 && it.writeString(1, lt),
                (lt = xe.getAccessToken()),
                lt.length > 0 && it.writeString(2, lt));
            }),
          (proto.alis.os.products.v1.Organisation.Github.prototype.getOrganisationId =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.Organisation.Github.prototype.setOrganisationId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.Organisation.Github.prototype.getAccessToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.products.v1.Organisation.Github.prototype.setAccessToken =
            function (xe) {
              return ee.Message.setProto3StringField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getName =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setName = function (
            xe,
          ) {
            return ee.Message.setProto3StringField(this, 1, xe);
          }),
          (proto.alis.os.products.v1.Organisation.prototype.getDisplayName =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setDisplayName =
            function (xe) {
              return ee.Message.setProto3StringField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getDescription =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setDescription =
            function (xe) {
              return ee.Message.setProto3StringField(this, 3, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getLogo =
            function () {
              return ee.Message.getFieldWithDefault(this, 4, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setLogo = function (
            xe,
          ) {
            return ee.Message.setProto3StringField(this, 4, xe);
          }),
          (proto.alis.os.products.v1.Organisation.prototype.getGoogleProject =
            function () {
              return ee.Message.getWrapperField(this, ft.GoogleProject, 5);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setGoogleProject =
            function (xe) {
              return ee.Message.setWrapperField(this, 5, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearGoogleProject =
            function () {
              return this.setGoogleProject(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasGoogleProject =
            function () {
              return ee.Message.getField(this, 5) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getBucketsDomain =
            function () {
              return ee.Message.getFieldWithDefault(this, 6, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setBucketsDomain =
            function (xe) {
              return ee.Message.setProto3StringField(this, 6, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getPackagesDomain =
            function () {
              return ee.Message.getFieldWithDefault(this, 10, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setPackagesDomain =
            function (xe) {
              return ee.Message.setProto3StringField(this, 10, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getAccount =
            function () {
              return ee.Message.getFieldWithDefault(this, 12, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setAccount =
            function (xe) {
              return ee.Message.setProto3StringField(this, 12, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getSpannerInstance =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.products.v1.SpannerInstance,
                7,
              );
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setSpannerInstance =
            function (xe) {
              return ee.Message.setWrapperField(this, 7, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearSpannerInstance =
            function () {
              return this.setSpannerInstance(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasSpannerInstance =
            function () {
              return ee.Message.getField(this, 7) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getServiceAccount =
            function () {
              return ee.Message.getWrapperField(this, ft.ServiceAccount, 8);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setServiceAccount =
            function (xe) {
              return ee.Message.setWrapperField(this, 8, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearServiceAccount =
            function () {
              return this.setServiceAccount(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasServiceAccount =
            function () {
              return ee.Message.getField(this, 8) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getGitRepo =
            function () {
              return ee.Message.getWrapperField(this, ft.GitRepo, 9);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setGitRepo =
            function (xe) {
              return ee.Message.setWrapperField(this, 9, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearGitRepo =
            function () {
              return this.setGitRepo(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasGitRepo =
            function () {
              return ee.Message.getField(this, 9) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getLoadbalancer =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.products.v1.Loadbalancer,
                11,
              );
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setLoadbalancer =
            function (xe) {
              return ee.Message.setWrapperField(this, 11, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearLoadbalancer =
            function () {
              return this.setLoadbalancer(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasLoadbalancer =
            function () {
              return ee.Message.getField(this, 11) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getState =
            function () {
              return ee.Message.getFieldWithDefault(this, 21, 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setState =
            function (xe) {
              return ee.Message.setProto3EnumField(this, 21, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getDeployOperation =
            function () {
              return ee.Message.getFieldWithDefault(this, 22, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setDeployOperation =
            function (xe) {
              return ee.Message.setProto3StringField(this, 22, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getLastSuccessfulDeployTime =
            function () {
              return ee.Message.getWrapperField(this, gt.Timestamp, 23);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setLastSuccessfulDeployTime =
            function (xe) {
              return ee.Message.setWrapperField(this, 23, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearLastSuccessfulDeployTime =
            function () {
              return this.setLastSuccessfulDeployTime(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasLastSuccessfulDeployTime =
            function () {
              return ee.Message.getField(this, 23) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getWorkforceFederationPoolId =
            function () {
              return ee.Message.getFieldWithDefault(this, 31, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setWorkforceFederationPoolId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 31, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getWorkforceFederationMicrosoftProviderId =
            function () {
              return ee.Message.getFieldWithDefault(this, 32, "");
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setWorkforceFederationMicrosoftProviderId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 32, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getGithub =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.products.v1.Organisation.Github,
                41,
              );
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setGithub =
            function (xe) {
              return ee.Message.setWrapperField(this, 41, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearGithub =
            function () {
              return this.setGithub(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasGithub =
            function () {
              return ee.Message.getField(this, 41) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getCreateTime =
            function () {
              return ee.Message.getWrapperField(this, gt.Timestamp, 98);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setCreateTime =
            function (xe) {
              return ee.Message.setWrapperField(this, 98, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearCreateTime =
            function () {
              return this.setCreateTime(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasCreateTime =
            function () {
              return ee.Message.getField(this, 98) != null;
            }),
          (proto.alis.os.products.v1.Organisation.prototype.getUpdateTime =
            function () {
              return ee.Message.getWrapperField(this, gt.Timestamp, 99);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.setUpdateTime =
            function (xe) {
              return ee.Message.setWrapperField(this, 99, xe);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.clearUpdateTime =
            function () {
              return this.setUpdateTime(void 0);
            }),
          (proto.alis.os.products.v1.Organisation.prototype.hasUpdateTime =
            function () {
              return ee.Message.getField(this, 99) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.SpannerInstance.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.SpannerInstance.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.SpannerInstance.toObject = function (
              xe,
              it,
            ) {
              var lt = {
                instanceProject: ee.Message.getFieldWithDefault(it, 1, ""),
                instanceName: ee.Message.getFieldWithDefault(it, 2, ""),
                processingUnits: ee.Message.getFieldWithDefault(it, 3, 0),
                consoleUri: ee.Message.getFieldWithDefault(it, 4, ""),
              };
              return (xe && (lt.$jspbMessageInstance = it), lt);
            })),
          (proto.alis.os.products.v1.SpannerInstance.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.SpannerInstance();
              return proto.alis.os.products.v1.SpannerInstance.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.SpannerInstance.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.setInstanceProject(rt);
                    break;
                  case 2:
                    var rt = it.readStringRequireUtf8();
                    xe.setInstanceName(rt);
                    break;
                  case 3:
                    var rt = it.readInt32();
                    xe.setProcessingUnits(rt);
                    break;
                  case 4:
                    var rt = it.readStringRequireUtf8();
                    xe.setConsoleUri(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.SpannerInstance.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.SpannerInstance.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getInstanceProject()),
                lt.length > 0 && it.writeString(1, lt),
                (lt = xe.getInstanceName()),
                lt.length > 0 && it.writeString(2, lt),
                (lt = xe.getProcessingUnits()),
                lt !== 0 && it.writeInt32(3, lt),
                (lt = xe.getConsoleUri()),
                lt.length > 0 && it.writeString(4, lt));
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.getInstanceProject =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.setInstanceProject =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.getInstanceName =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.setInstanceName =
            function (xe) {
              return ee.Message.setProto3StringField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.getProcessingUnits =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, 0);
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.setProcessingUnits =
            function (xe) {
              return ee.Message.setProto3IntField(this, 3, xe);
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.getConsoleUri =
            function () {
              return ee.Message.getFieldWithDefault(this, 4, "");
            }),
          (proto.alis.os.products.v1.SpannerInstance.prototype.setConsoleUri =
            function (xe) {
              return ee.Message.setProto3StringField(this, 4, xe);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.Loadbalancer.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.Loadbalancer.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.Loadbalancer.toObject = function (
              xe,
              it,
            ) {
              var lt = {
                loadbalancerUri: ee.Message.getFieldWithDefault(it, 1, ""),
                ipAddressUri: ee.Message.getFieldWithDefault(it, 2, ""),
                certificateMapUri: ee.Message.getFieldWithDefault(it, 3, ""),
              };
              return (xe && (lt.$jspbMessageInstance = it), lt);
            })),
          (proto.alis.os.products.v1.Loadbalancer.deserializeBinary = function (
            xe,
          ) {
            var it = new ee.BinaryReader(xe),
              lt = new proto.alis.os.products.v1.Loadbalancer();
            return proto.alis.os.products.v1.Loadbalancer.deserializeBinaryFromReader(
              lt,
              it,
            );
          }),
          (proto.alis.os.products.v1.Loadbalancer.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.setLoadbalancerUri(rt);
                    break;
                  case 2:
                    var rt = it.readStringRequireUtf8();
                    xe.setIpAddressUri(rt);
                    break;
                  case 3:
                    var rt = it.readStringRequireUtf8();
                    xe.setCertificateMapUri(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.Loadbalancer.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.Loadbalancer.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.Loadbalancer.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getLoadbalancerUri()),
                lt.length > 0 && it.writeString(1, lt),
                (lt = xe.getIpAddressUri()),
                lt.length > 0 && it.writeString(2, lt),
                (lt = xe.getCertificateMapUri()),
                lt.length > 0 && it.writeString(3, lt));
            }),
          (proto.alis.os.products.v1.Loadbalancer.prototype.getLoadbalancerUri =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.Loadbalancer.prototype.setLoadbalancerUri =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.Loadbalancer.prototype.getIpAddressUri =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.products.v1.Loadbalancer.prototype.setIpAddressUri =
            function (xe) {
              return ee.Message.setProto3StringField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.Loadbalancer.prototype.getCertificateMapUri =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.products.v1.Loadbalancer.prototype.setCertificateMapUri =
            function (xe) {
              return ee.Message.setProto3StringField(this, 3, xe);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.GetOrganisationRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.GetOrganisationRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.GetOrganisationRequest.toObject =
              function (xe, it) {
                var lt,
                  rt = {
                    name: ee.Message.getFieldWithDefault(it, 1, ""),
                    readMask:
                      (lt = it.getReadMask()) && ht.FieldMask.toObject(xe, lt),
                  };
                return (xe && (rt.$jspbMessageInstance = it), rt);
              })),
          (proto.alis.os.products.v1.GetOrganisationRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.GetOrganisationRequest();
              return proto.alis.os.products.v1.GetOrganisationRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.setName(rt);
                    break;
                  case 2:
                    var rt = new ht.FieldMask();
                    (it.readMessage(
                      rt,
                      ht.FieldMask.deserializeBinaryFromReader,
                    ),
                      xe.setReadMask(rt));
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.GetOrganisationRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getName()),
                lt.length > 0 && it.writeString(1, lt),
                (lt = xe.getReadMask()),
                lt != null &&
                  it.writeMessage(2, lt, ht.FieldMask.serializeBinaryToWriter));
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.prototype.getName =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.prototype.setName =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.prototype.getReadMask =
            function () {
              return ee.Message.getWrapperField(this, ht.FieldMask, 2);
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.prototype.setReadMask =
            function (xe) {
              return ee.Message.setWrapperField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.prototype.clearReadMask =
            function () {
              return this.setReadMask(void 0);
            }),
          (proto.alis.os.products.v1.GetOrganisationRequest.prototype.hasReadMask =
            function () {
              return ee.Message.getField(this, 2) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.CreateOrganisationRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.CreateOrganisationRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.CreateOrganisationRequest.toObject =
              function (xe, it) {
                var lt,
                  rt = {
                    organisation:
                      (lt = it.getOrganisation()) &&
                      proto.alis.os.products.v1.Organisation.toObject(xe, lt),
                    organisationId: ee.Message.getFieldWithDefault(it, 3, ""),
                  };
                return (xe && (rt.$jspbMessageInstance = it), rt);
              })),
          (proto.alis.os.products.v1.CreateOrganisationRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.CreateOrganisationRequest();
              return proto.alis.os.products.v1.CreateOrganisationRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 2:
                    var rt = new proto.alis.os.products.v1.Organisation();
                    (it.readMessage(
                      rt,
                      proto.alis.os.products.v1.Organisation
                        .deserializeBinaryFromReader,
                    ),
                      xe.setOrganisation(rt));
                    break;
                  case 3:
                    var rt = it.readStringRequireUtf8();
                    xe.setOrganisationId(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.CreateOrganisationRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisation()),
                lt != null &&
                  it.writeMessage(
                    2,
                    lt,
                    proto.alis.os.products.v1.Organisation
                      .serializeBinaryToWriter,
                  ),
                (lt = xe.getOrganisationId()),
                lt.length > 0 && it.writeString(3, lt));
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.prototype.getOrganisation =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.products.v1.Organisation,
                2,
              );
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.prototype.setOrganisation =
            function (xe) {
              return ee.Message.setWrapperField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.prototype.clearOrganisation =
            function () {
              return this.setOrganisation(void 0);
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.prototype.hasOrganisation =
            function () {
              return ee.Message.getField(this, 2) != null;
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.prototype.getOrganisationId =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.products.v1.CreateOrganisationRequest.prototype.setOrganisationId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 3, xe);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.UpdateOrganisationRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.UpdateOrganisationRequest.toObject =
              function (xe, it) {
                var lt,
                  rt = {
                    organisation:
                      (lt = it.getOrganisation()) &&
                      proto.alis.os.products.v1.Organisation.toObject(xe, lt),
                    updateMask:
                      (lt = it.getUpdateMask()) &&
                      ht.FieldMask.toObject(xe, lt),
                    skipDeploy: ee.Message.getBooleanFieldWithDefault(
                      it,
                      3,
                      !1,
                    ),
                    planDeploy: ee.Message.getBooleanFieldWithDefault(
                      it,
                      4,
                      !1,
                    ),
                  };
                return (xe && (rt.$jspbMessageInstance = it), rt);
              })),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.UpdateOrganisationRequest();
              return proto.alis.os.products.v1.UpdateOrganisationRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = new proto.alis.os.products.v1.Organisation();
                    (it.readMessage(
                      rt,
                      proto.alis.os.products.v1.Organisation
                        .deserializeBinaryFromReader,
                    ),
                      xe.setOrganisation(rt));
                    break;
                  case 2:
                    var rt = new ht.FieldMask();
                    (it.readMessage(
                      rt,
                      ht.FieldMask.deserializeBinaryFromReader,
                    ),
                      xe.setUpdateMask(rt));
                    break;
                  case 3:
                    var rt = it.readBool();
                    xe.setSkipDeploy(rt);
                    break;
                  case 4:
                    var rt = it.readBool();
                    xe.setPlanDeploy(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.UpdateOrganisationRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisation()),
                lt != null &&
                  it.writeMessage(
                    1,
                    lt,
                    proto.alis.os.products.v1.Organisation
                      .serializeBinaryToWriter,
                  ),
                (lt = xe.getUpdateMask()),
                lt != null &&
                  it.writeMessage(2, lt, ht.FieldMask.serializeBinaryToWriter),
                (lt = xe.getSkipDeploy()),
                lt && it.writeBool(3, lt),
                (lt = xe.getPlanDeploy()),
                lt && it.writeBool(4, lt));
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.getOrganisation =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.products.v1.Organisation,
                1,
              );
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.setOrganisation =
            function (xe) {
              return ee.Message.setWrapperField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.clearOrganisation =
            function () {
              return this.setOrganisation(void 0);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.hasOrganisation =
            function () {
              return ee.Message.getField(this, 1) != null;
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.getUpdateMask =
            function () {
              return ee.Message.getWrapperField(this, ht.FieldMask, 2);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.setUpdateMask =
            function (xe) {
              return ee.Message.setWrapperField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.clearUpdateMask =
            function () {
              return this.setUpdateMask(void 0);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.hasUpdateMask =
            function () {
              return ee.Message.getField(this, 2) != null;
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.getSkipDeploy =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 3, !1);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.setSkipDeploy =
            function (xe) {
              return ee.Message.setProto3BooleanField(this, 3, xe);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.getPlanDeploy =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 4, !1);
            }),
          (proto.alis.os.products.v1.UpdateOrganisationRequest.prototype.setPlanDeploy =
            function (xe) {
              return ee.Message.setProto3BooleanField(this, 4, xe);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.DeleteOrganisationRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.DeleteOrganisationRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.DeleteOrganisationRequest.toObject =
              function (xe, it) {
                var lt = {
                  name: ee.Message.getFieldWithDefault(it, 1, ""),
                };
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.DeleteOrganisationRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.DeleteOrganisationRequest();
              return proto.alis.os.products.v1.DeleteOrganisationRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.DeleteOrganisationRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                if (lt === 1) {
                  var rt = it.readStringRequireUtf8();
                  xe.setName(rt);
                } else it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.DeleteOrganisationRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.DeleteOrganisationRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.DeleteOrganisationRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getName()), lt.length > 0 && it.writeString(1, lt));
            }),
          (proto.alis.os.products.v1.DeleteOrganisationRequest.prototype.getName =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.DeleteOrganisationRequest.prototype.setName =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.ListOrganisationsRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.ListOrganisationsRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.ListOrganisationsRequest.toObject =
              function (xe, it) {
                var lt,
                  rt = {
                    pageSize: ee.Message.getFieldWithDefault(it, 2, 0),
                    pageToken: ee.Message.getFieldWithDefault(it, 3, ""),
                    readMask:
                      (lt = it.getReadMask()) && ht.FieldMask.toObject(xe, lt),
                    filter: ee.Message.getFieldWithDefault(it, 5, ""),
                  };
                return (xe && (rt.$jspbMessageInstance = it), rt);
              })),
          (proto.alis.os.products.v1.ListOrganisationsRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.ListOrganisationsRequest();
              return proto.alis.os.products.v1.ListOrganisationsRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 2:
                    var rt = it.readInt32();
                    xe.setPageSize(rt);
                    break;
                  case 3:
                    var rt = it.readStringRequireUtf8();
                    xe.setPageToken(rt);
                    break;
                  case 4:
                    var rt = new ht.FieldMask();
                    (it.readMessage(
                      rt,
                      ht.FieldMask.deserializeBinaryFromReader,
                    ),
                      xe.setReadMask(rt));
                    break;
                  case 5:
                    var rt = it.readStringRequireUtf8();
                    xe.setFilter(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.ListOrganisationsRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getPageSize()),
                lt !== 0 && it.writeInt32(2, lt),
                (lt = xe.getPageToken()),
                lt.length > 0 && it.writeString(3, lt),
                (lt = xe.getReadMask()),
                lt != null &&
                  it.writeMessage(4, lt, ht.FieldMask.serializeBinaryToWriter),
                (lt = xe.getFilter()),
                lt.length > 0 && it.writeString(5, lt));
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.getPageSize =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, 0);
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.setPageSize =
            function (xe) {
              return ee.Message.setProto3IntField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.getPageToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.setPageToken =
            function (xe) {
              return ee.Message.setProto3StringField(this, 3, xe);
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.getReadMask =
            function () {
              return ee.Message.getWrapperField(this, ht.FieldMask, 4);
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.setReadMask =
            function (xe) {
              return ee.Message.setWrapperField(this, 4, xe);
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.clearReadMask =
            function () {
              return this.setReadMask(void 0);
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.hasReadMask =
            function () {
              return ee.Message.getField(this, 4) != null;
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.getFilter =
            function () {
              return ee.Message.getFieldWithDefault(this, 5, "");
            }),
          (proto.alis.os.products.v1.ListOrganisationsRequest.prototype.setFilter =
            function (xe) {
              return ee.Message.setProto3StringField(this, 5, xe);
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.repeatedFields_ =
            [1]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.ListOrganisationsResponse.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.ListOrganisationsResponse.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.ListOrganisationsResponse.toObject =
              function (xe, it) {
                var lt = {
                  organisationsList: ee.Message.toObjectList(
                    it.getOrganisationsList(),
                    proto.alis.os.products.v1.Organisation.toObject,
                    xe,
                  ),
                  nextPageToken: ee.Message.getFieldWithDefault(it, 2, ""),
                };
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.ListOrganisationsResponse.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.ListOrganisationsResponse();
              return proto.alis.os.products.v1.ListOrganisationsResponse.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = new proto.alis.os.products.v1.Organisation();
                    (it.readMessage(
                      rt,
                      proto.alis.os.products.v1.Organisation
                        .deserializeBinaryFromReader,
                    ),
                      xe.addOrganisations(rt));
                    break;
                  case 2:
                    var rt = it.readStringRequireUtf8();
                    xe.setNextPageToken(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.ListOrganisationsResponse.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisationsList()),
                lt.length > 0 &&
                  it.writeRepeatedMessage(
                    1,
                    lt,
                    proto.alis.os.products.v1.Organisation
                      .serializeBinaryToWriter,
                  ),
                (lt = xe.getNextPageToken()),
                lt.length > 0 && it.writeString(2, lt));
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.prototype.getOrganisationsList =
            function () {
              return ee.Message.getRepeatedWrapperField(
                this,
                proto.alis.os.products.v1.Organisation,
                1,
              );
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.prototype.setOrganisationsList =
            function (xe) {
              return ee.Message.setRepeatedWrapperField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.prototype.addOrganisations =
            function (xe, it) {
              return ee.Message.addToRepeatedWrapperField(
                this,
                1,
                xe,
                proto.alis.os.products.v1.Organisation,
                it,
              );
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.prototype.clearOrganisationsList =
            function () {
              return this.setOrganisationsList([]);
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.prototype.getNextPageToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.products.v1.ListOrganisationsResponse.prototype.setNextPageToken =
            function (xe) {
              return ee.Message.setProto3StringField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.repeatedFields_ =
            [1]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.BatchGetOrganisationsRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.BatchGetOrganisationsRequest.toObject =
              function (xe, it) {
                var lt,
                  rt = {
                    namesList:
                      (lt = ee.Message.getRepeatedField(it, 1)) == null
                        ? void 0
                        : lt,
                    readMask:
                      (lt = it.getReadMask()) && ht.FieldMask.toObject(xe, lt),
                  };
                return (xe && (rt.$jspbMessageInstance = it), rt);
              })),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt =
                  new proto.alis.os.products.v1.BatchGetOrganisationsRequest();
              return proto.alis.os.products.v1.BatchGetOrganisationsRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.addNames(rt);
                    break;
                  case 2:
                    var rt = new ht.FieldMask();
                    (it.readMessage(
                      rt,
                      ht.FieldMask.deserializeBinaryFromReader,
                    ),
                      xe.setReadMask(rt));
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.BatchGetOrganisationsRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getNamesList()),
                lt.length > 0 && it.writeRepeatedString(1, lt),
                (lt = xe.getReadMask()),
                lt != null &&
                  it.writeMessage(2, lt, ht.FieldMask.serializeBinaryToWriter));
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.getNamesList =
            function () {
              return ee.Message.getRepeatedField(this, 1);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.setNamesList =
            function (xe) {
              return ee.Message.setField(this, 1, xe || []);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.addNames =
            function (xe, it) {
              return ee.Message.addToRepeatedField(this, 1, xe, it);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.clearNamesList =
            function () {
              return this.setNamesList([]);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.getReadMask =
            function () {
              return ee.Message.getWrapperField(this, ht.FieldMask, 2);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.setReadMask =
            function (xe) {
              return ee.Message.setWrapperField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.clearReadMask =
            function () {
              return this.setReadMask(void 0);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsRequest.prototype.hasReadMask =
            function () {
              return ee.Message.getField(this, 2) != null;
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.repeatedFields_ =
            [1]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.BatchGetOrganisationsResponse.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.BatchGetOrganisationsResponse.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.BatchGetOrganisationsResponse.toObject =
              function (xe, it) {
                var lt = {
                  organisationsList: ee.Message.toObjectList(
                    it.getOrganisationsList(),
                    proto.alis.os.products.v1.Organisation.toObject,
                    xe,
                  ),
                };
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt =
                  new proto.alis.os.products.v1.BatchGetOrganisationsResponse();
              return proto.alis.os.products.v1.BatchGetOrganisationsResponse.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                if (lt === 1) {
                  var rt = new proto.alis.os.products.v1.Organisation();
                  (it.readMessage(
                    rt,
                    proto.alis.os.products.v1.Organisation
                      .deserializeBinaryFromReader,
                  ),
                    xe.addOrganisations(rt));
                } else it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.BatchGetOrganisationsResponse.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisationsList()),
                lt.length > 0 &&
                  it.writeRepeatedMessage(
                    1,
                    lt,
                    proto.alis.os.products.v1.Organisation
                      .serializeBinaryToWriter,
                  ));
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.prototype.getOrganisationsList =
            function () {
              return ee.Message.getRepeatedWrapperField(
                this,
                proto.alis.os.products.v1.Organisation,
                1,
              );
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.prototype.setOrganisationsList =
            function (xe) {
              return ee.Message.setRepeatedWrapperField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.prototype.addOrganisations =
            function (xe, it) {
              return ee.Message.addToRepeatedWrapperField(
                this,
                1,
                xe,
                proto.alis.os.products.v1.Organisation,
                it,
              );
            }),
          (proto.alis.os.products.v1.BatchGetOrganisationsResponse.prototype.clearOrganisationsList =
            function () {
              return this.setOrganisationsList([]);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.DeployOrganisationRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.DeployOrganisationRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.DeployOrganisationRequest.toObject =
              function (xe, it) {
                var lt = {
                  organisation: ee.Message.getFieldWithDefault(it, 1, ""),
                  plan: ee.Message.getBooleanFieldWithDefault(it, 2, !1),
                  destroy: ee.Message.getBooleanFieldWithDefault(it, 3, !1),
                };
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.DeployOrganisationRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.DeployOrganisationRequest();
              return proto.alis.os.products.v1.DeployOrganisationRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.setOrganisation(rt);
                    break;
                  case 2:
                    var rt = it.readBool();
                    xe.setPlan(rt);
                    break;
                  case 3:
                    var rt = it.readBool();
                    xe.setDestroy(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.DeployOrganisationRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisation()),
                lt.length > 0 && it.writeString(1, lt),
                (lt = xe.getPlan()),
                lt && it.writeBool(2, lt),
                (lt = xe.getDestroy()),
                lt && it.writeBool(3, lt));
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.prototype.getOrganisation =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.prototype.setOrganisation =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.prototype.getPlan =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 2, !1);
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.prototype.setPlan =
            function (xe) {
              return ee.Message.setProto3BooleanField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.prototype.getDestroy =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 3, !1);
            }),
          (proto.alis.os.products.v1.DeployOrganisationRequest.prototype.setDestroy =
            function (xe) {
              return ee.Message.setProto3BooleanField(this, 3, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.repeatedFields_ =
            [11]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.DeployOrganisationMetadata.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.DeployOrganisationMetadata.toObject =
              function (xe, it) {
                var lt,
                  rt = {
                    organisation:
                      (lt = it.getOrganisation()) &&
                      proto.alis.os.products.v1.Organisation.toObject(xe, lt),
                    logsMap: (lt = it.getLogsMap())
                      ? lt.toObject(xe, void 0)
                      : [],
                    plan: ee.Message.getBooleanFieldWithDefault(it, 3, !1),
                    destroy: ee.Message.getBooleanFieldWithDefault(it, 4, !1),
                    crJobExecution: ee.Message.getFieldWithDefault(it, 5, ""),
                    crJobOperation: ee.Message.getFieldWithDefault(it, 6, ""),
                    waitingForOperation: ee.Message.getFieldWithDefault(
                      it,
                      7,
                      "",
                    ),
                    piggyBackingOnOperation: ee.Message.getFieldWithDefault(
                      it,
                      8,
                      "",
                    ),
                    modulesList: ee.Message.toObjectList(
                      it.getModulesList(),
                      ft.Module.toObject,
                      xe,
                    ),
                  };
                return (xe && (rt.$jspbMessageInstance = it), rt);
              })),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.DeployOrganisationMetadata();
              return proto.alis.os.products.v1.DeployOrganisationMetadata.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = new proto.alis.os.products.v1.Organisation();
                    (it.readMessage(
                      rt,
                      proto.alis.os.products.v1.Organisation
                        .deserializeBinaryFromReader,
                    ),
                      xe.setOrganisation(rt));
                    break;
                  case 2:
                    var rt = xe.getLogsMap();
                    it.readMessage(rt, function (mt, St) {
                      ee.Map.deserializeBinary(
                        mt,
                        St,
                        ee.BinaryReader.prototype.readStringRequireUtf8,
                        ee.BinaryReader.prototype.readBytes,
                        null,
                        "",
                        "",
                      );
                    });
                    break;
                  case 3:
                    var rt = it.readBool();
                    xe.setPlan(rt);
                    break;
                  case 4:
                    var rt = it.readBool();
                    xe.setDestroy(rt);
                    break;
                  case 5:
                    var rt = it.readStringRequireUtf8();
                    xe.setCrJobExecution(rt);
                    break;
                  case 6:
                    var rt = it.readStringRequireUtf8();
                    xe.setCrJobOperation(rt);
                    break;
                  case 7:
                    var rt = it.readStringRequireUtf8();
                    xe.setWaitingForOperation(rt);
                    break;
                  case 8:
                    var rt = it.readStringRequireUtf8();
                    xe.setPiggyBackingOnOperation(rt);
                    break;
                  case 11:
                    var rt = new ft.Module();
                    (it.readMessage(rt, ft.Module.deserializeBinaryFromReader),
                      xe.addModules(rt));
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.DeployOrganisationMetadata.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisation()),
                lt != null &&
                  it.writeMessage(
                    1,
                    lt,
                    proto.alis.os.products.v1.Organisation
                      .serializeBinaryToWriter,
                  ),
                (lt = xe.getLogsMap(!0)),
                lt &&
                  lt.getLength() > 0 &&
                  ee.internal.public_for_gencode.serializeMapToBinary(
                    xe.getLogsMap(!0),
                    2,
                    it,
                    ee.BinaryWriter.prototype.writeString,
                    ee.BinaryWriter.prototype.writeBytes,
                  ),
                (lt = xe.getPlan()),
                lt && it.writeBool(3, lt),
                (lt = xe.getDestroy()),
                lt && it.writeBool(4, lt),
                (lt = xe.getCrJobExecution()),
                lt.length > 0 && it.writeString(5, lt),
                (lt = xe.getCrJobOperation()),
                lt.length > 0 && it.writeString(6, lt),
                (lt = xe.getWaitingForOperation()),
                lt.length > 0 && it.writeString(7, lt),
                (lt = xe.getPiggyBackingOnOperation()),
                lt.length > 0 && it.writeString(8, lt),
                (lt = xe.getModulesList()),
                lt.length > 0 &&
                  it.writeRepeatedMessage(
                    11,
                    lt,
                    ft.Module.serializeBinaryToWriter,
                  ));
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getOrganisation =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.products.v1.Organisation,
                1,
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setOrganisation =
            function (xe) {
              return ee.Message.setWrapperField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.clearOrganisation =
            function () {
              return this.setOrganisation(void 0);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.hasOrganisation =
            function () {
              return ee.Message.getField(this, 1) != null;
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getLogsMap =
            function (xe) {
              return ee.Message.getMapField(this, 2, xe, null);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.clearLogsMap =
            function () {
              return (this.getLogsMap().clear(), this);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getPlan =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 3, !1);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setPlan =
            function (xe) {
              return ee.Message.setProto3BooleanField(this, 3, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getDestroy =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 4, !1);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setDestroy =
            function (xe) {
              return ee.Message.setProto3BooleanField(this, 4, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getCrJobExecution =
            function () {
              return ee.Message.getFieldWithDefault(this, 5, "");
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setCrJobExecution =
            function (xe) {
              return ee.Message.setProto3StringField(this, 5, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getCrJobOperation =
            function () {
              return ee.Message.getFieldWithDefault(this, 6, "");
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setCrJobOperation =
            function (xe) {
              return ee.Message.setProto3StringField(this, 6, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getWaitingForOperation =
            function () {
              return ee.Message.getFieldWithDefault(this, 7, "");
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setWaitingForOperation =
            function (xe) {
              return ee.Message.setProto3StringField(this, 7, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getPiggyBackingOnOperation =
            function () {
              return ee.Message.getFieldWithDefault(this, 8, "");
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setPiggyBackingOnOperation =
            function (xe) {
              return ee.Message.setProto3StringField(this, 8, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.getModulesList =
            function () {
              return ee.Message.getRepeatedWrapperField(this, ft.Module, 11);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.setModulesList =
            function (xe) {
              return ee.Message.setRepeatedWrapperField(this, 11, xe);
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.addModules =
            function (xe, it) {
              return ee.Message.addToRepeatedWrapperField(
                this,
                11,
                xe,
                proto.alis.os.products.v1.Module,
                it,
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationMetadata.prototype.clearModulesList =
            function () {
              return this.setModulesList([]);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.DeployOrganisationResponse.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.DeployOrganisationResponse.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.DeployOrganisationResponse.toObject =
              function (xe, it) {
                var lt = {};
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.DeployOrganisationResponse.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.DeployOrganisationResponse();
              return proto.alis.os.products.v1.DeployOrganisationResponse.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationResponse.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.DeployOrganisationResponse.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.DeployOrganisationResponse.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.DeployOrganisationResponse.serializeBinaryToWriter =
            function (xe, it) {}),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.DeleteOrganisationMetadata.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.DeleteOrganisationMetadata.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.DeleteOrganisationMetadata.toObject =
              function (xe, it) {
                var lt,
                  rt = {
                    organisation:
                      (lt = it.getOrganisation()) &&
                      proto.alis.os.products.v1.Organisation.toObject(xe, lt),
                  };
                return (xe && (rt.$jspbMessageInstance = it), rt);
              })),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.DeleteOrganisationMetadata();
              return proto.alis.os.products.v1.DeleteOrganisationMetadata.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                if (lt === 1) {
                  var rt = new proto.alis.os.products.v1.Organisation();
                  (it.readMessage(
                    rt,
                    proto.alis.os.products.v1.Organisation
                      .deserializeBinaryFromReader,
                  ),
                    xe.setOrganisation(rt));
                } else it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.DeleteOrganisationMetadata.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisation()),
                lt != null &&
                  it.writeMessage(
                    1,
                    lt,
                    proto.alis.os.products.v1.Organisation
                      .serializeBinaryToWriter,
                  ));
            }),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.prototype.getOrganisation =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.products.v1.Organisation,
                1,
              );
            }),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.prototype.setOrganisation =
            function (xe) {
              return ee.Message.setWrapperField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.prototype.clearOrganisation =
            function () {
              return this.setOrganisation(void 0);
            }),
          (proto.alis.os.products.v1.DeleteOrganisationMetadata.prototype.hasOrganisation =
            function () {
              return ee.Message.getField(this, 1) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.DeleteOrganisationResponse.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.DeleteOrganisationResponse.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.DeleteOrganisationResponse.toObject =
              function (xe, it) {
                var lt = {};
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.DeleteOrganisationResponse.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt = new proto.alis.os.products.v1.DeleteOrganisationResponse();
              return proto.alis.os.products.v1.DeleteOrganisationResponse.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.DeleteOrganisationResponse.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                it.skipField();
              }
              return xe;
            }),
          (proto.alis.os.products.v1.DeleteOrganisationResponse.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.DeleteOrganisationResponse.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.DeleteOrganisationResponse.serializeBinaryToWriter =
            function (xe, it) {}),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.toObject =
              function (xe) {
                return proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.toObject(
                  xe,
                  this,
                );
              }),
            (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.toObject =
              function (xe, it) {
                var lt = {
                  organisation: ee.Message.getFieldWithDefault(it, 1, ""),
                  workforceFederationPoolId: ee.Message.getFieldWithDefault(
                    it,
                    2,
                    "",
                  ),
                  workforceFederationMicrosoftProviderId:
                    ee.Message.getFieldWithDefault(it, 3, ""),
                };
                return (xe && (lt.$jspbMessageInstance = it), lt);
              })),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.deserializeBinary =
            function (xe) {
              var it = new ee.BinaryReader(xe),
                lt =
                  new proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest();
              return proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.deserializeBinaryFromReader(
                lt,
                it,
              );
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.deserializeBinaryFromReader =
            function (xe, it) {
              for (; it.nextField() && !it.isEndGroup(); ) {
                var lt = it.getFieldNumber();
                switch (lt) {
                  case 1:
                    var rt = it.readStringRequireUtf8();
                    xe.setOrganisation(rt);
                    break;
                  case 2:
                    var rt = it.readStringRequireUtf8();
                    xe.setWorkforceFederationPoolId(rt);
                    break;
                  case 3:
                    var rt = it.readStringRequireUtf8();
                    xe.setWorkforceFederationMicrosoftProviderId(rt);
                    break;
                  default:
                    it.skipField();
                    break;
                }
              }
              return xe;
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.serializeBinary =
            function () {
              var xe = new ee.BinaryWriter();
              return (
                proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.serializeBinaryToWriter(
                  this,
                  xe,
                ),
                xe.getResultBuffer()
              );
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.serializeBinaryToWriter =
            function (xe, it) {
              var lt = void 0;
              ((lt = xe.getOrganisation()),
                lt.length > 0 && it.writeString(1, lt),
                (lt = xe.getWorkforceFederationPoolId()),
                lt.length > 0 && it.writeString(2, lt),
                (lt = xe.getWorkforceFederationMicrosoftProviderId()),
                lt.length > 0 && it.writeString(3, lt));
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.getOrganisation =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.setOrganisation =
            function (xe) {
              return ee.Message.setProto3StringField(this, 1, xe);
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.getWorkforceFederationPoolId =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.setWorkforceFederationPoolId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 2, xe);
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.getWorkforceFederationMicrosoftProviderId =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.products.v1.SetOrganisationWorkforceFederationRequest.prototype.setWorkforceFederationMicrosoftProviderId =
            function (xe) {
              return ee.Message.setProto3StringField(this, 3, xe);
            }),
          te.object.extend(ne, proto.alis.os.products.v1));
      })(organisation_pb)),
    organisation_pb
  );
}
