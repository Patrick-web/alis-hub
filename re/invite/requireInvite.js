function requireInvite_pb() {
  return (
    hasRequiredInvite_pb ||
      ((hasRequiredInvite_pb = 1),
      (function (ne) {
        var ee = requireGoogleProtobuf$1(),
          te = ee,
          vt = globalThis,
          gt = requireVendor_pb();
        te.object.extend(proto, gt);
        var ht = requireField_mask_pb();
        te.object.extend(proto, ht);
        var pt = requireTimestamp_pb$1();
        te.object.extend(proto, pt);
        var Rt = requireBuild_partner_pb();
        te.object.extend(proto, Rt);
        var yt = requirePhone_number_pb();
        te.object.extend(proto, yt);
        var ft = requirePostal_address_pb();
        te.object.extend(proto, ft);
        var ct = requireEmpty_pb$1();
        (te.object.extend(proto, ct),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.AcceptInviteRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.AcceptInviteResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.CreateInviteRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.CreateInviteResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.DeleteInviteRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.GenerateInviteTokenRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.GenerateInviteTokenResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.GetInviteRequest",
            null,
            vt,
          ),
          te.exportSymbol("proto.alis.os.accounts.v1.Invite", null, vt),
          te.exportSymbol("proto.alis.os.accounts.v1.Invite.User", null, vt),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.Invite.User.Role",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.ListInvitesRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.ListInvitesResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.PreviewInviteRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.PreviewInviteResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.RegenerateInviteTokenRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.RegenerateInviteTokenResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.os.accounts.v1.UpdateInviteRequest",
            null,
            vt,
          ),
          (proto.alis.os.accounts.v1.Invite = function (ut) {
            ee.Message.initialize(
              this,
              ut,
              0,
              -1,
              proto.alis.os.accounts.v1.Invite.repeatedFields_,
              null,
            );
          }),
          te.inherits(proto.alis.os.accounts.v1.Invite, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.Invite.displayName =
              "proto.alis.os.accounts.v1.Invite"),
          (proto.alis.os.accounts.v1.Invite.User = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(proto.alis.os.accounts.v1.Invite.User, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.Invite.User.displayName =
              "proto.alis.os.accounts.v1.Invite.User"),
          (proto.alis.os.accounts.v1.GetInviteRequest = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(proto.alis.os.accounts.v1.GetInviteRequest, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.GetInviteRequest.displayName =
              "proto.alis.os.accounts.v1.GetInviteRequest"),
          (proto.alis.os.accounts.v1.CreateInviteRequest = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.CreateInviteRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.CreateInviteRequest.displayName =
              "proto.alis.os.accounts.v1.CreateInviteRequest"),
          (proto.alis.os.accounts.v1.CreateInviteResponse = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.CreateInviteResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.CreateInviteResponse.displayName =
              "proto.alis.os.accounts.v1.CreateInviteResponse"),
          (proto.alis.os.accounts.v1.UpdateInviteRequest = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.UpdateInviteRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.UpdateInviteRequest.displayName =
              "proto.alis.os.accounts.v1.UpdateInviteRequest"),
          (proto.alis.os.accounts.v1.DeleteInviteRequest = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.DeleteInviteRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.DeleteInviteRequest.displayName =
              "proto.alis.os.accounts.v1.DeleteInviteRequest"),
          (proto.alis.os.accounts.v1.ListInvitesRequest = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(proto.alis.os.accounts.v1.ListInvitesRequest, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.ListInvitesRequest.displayName =
              "proto.alis.os.accounts.v1.ListInvitesRequest"),
          (proto.alis.os.accounts.v1.ListInvitesResponse = function (ut) {
            ee.Message.initialize(
              this,
              ut,
              0,
              -1,
              proto.alis.os.accounts.v1.ListInvitesResponse.repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.os.accounts.v1.ListInvitesResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.ListInvitesResponse.displayName =
              "proto.alis.os.accounts.v1.ListInvitesResponse"),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest = function (
            ut,
          ) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.GenerateInviteTokenRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.displayName =
              "proto.alis.os.accounts.v1.GenerateInviteTokenRequest"),
          (proto.alis.os.accounts.v1.GenerateInviteTokenResponse = function (
            ut,
          ) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.GenerateInviteTokenResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.displayName =
              "proto.alis.os.accounts.v1.GenerateInviteTokenResponse"),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest = function (
            ut,
          ) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.RegenerateInviteTokenRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.displayName =
              "proto.alis.os.accounts.v1.RegenerateInviteTokenRequest"),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse = function (
            ut,
          ) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.RegenerateInviteTokenResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.displayName =
              "proto.alis.os.accounts.v1.RegenerateInviteTokenResponse"),
          (proto.alis.os.accounts.v1.PreviewInviteRequest = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.PreviewInviteRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.PreviewInviteRequest.displayName =
              "proto.alis.os.accounts.v1.PreviewInviteRequest"),
          (proto.alis.os.accounts.v1.PreviewInviteResponse = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.PreviewInviteResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.PreviewInviteResponse.displayName =
              "proto.alis.os.accounts.v1.PreviewInviteResponse"),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner =
            function (ut) {
              ee.Message.initialize(this, ut, 0, -1, null, null);
            }),
          te.inherits(
            proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.displayName =
              "proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner"),
          (proto.alis.os.accounts.v1.AcceptInviteRequest = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.AcceptInviteRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.AcceptInviteRequest.displayName =
              "proto.alis.os.accounts.v1.AcceptInviteRequest"),
          (proto.alis.os.accounts.v1.AcceptInviteResponse = function (ut) {
            ee.Message.initialize(this, ut, 0, -1, null, null);
          }),
          te.inherits(
            proto.alis.os.accounts.v1.AcceptInviteResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.os.accounts.v1.AcceptInviteResponse.displayName =
              "proto.alis.os.accounts.v1.AcceptInviteResponse"),
          (proto.alis.os.accounts.v1.Invite.repeatedFields_ = [11, 12]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.Invite.prototype.toObject = function (
              ut,
            ) {
              return proto.alis.os.accounts.v1.Invite.toObject(ut, this);
            }),
            (proto.alis.os.accounts.v1.Invite.toObject = function (ut, xe) {
              var it,
                lt = {
                  name: ee.Message.getFieldWithDefault(xe, 1, ""),
                  ideateSeat: ee.Message.getFieldWithDefault(xe, 2, 0),
                  buildSeat: ee.Message.getFieldWithDefault(xe, 3, 0),
                  manageSeat: ee.Message.getFieldWithDefault(xe, 4, 0),
                  allowAll: ee.Message.getBooleanFieldWithDefault(xe, 10, !1),
                  domainsList:
                    (it = ee.Message.getRepeatedField(xe, 11)) == null
                      ? void 0
                      : it,
                  usersList: ee.Message.toObjectList(
                    xe.getUsersList(),
                    proto.alis.os.accounts.v1.Invite.User.toObject,
                    ut,
                  ),
                  expiryTime:
                    (it = xe.getExpiryTime()) && pt.Timestamp.toObject(ut, it),
                  designatedAccount: ee.Message.getFieldWithDefault(xe, 7, ""),
                  idea: ee.Message.getFieldWithDefault(xe, 8, ""),
                  buildPartner: ee.Message.getFieldWithDefault(xe, 9, ""),
                  inviter: ee.Message.getFieldWithDefault(xe, 97, ""),
                  createTime:
                    (it = xe.getCreateTime()) && pt.Timestamp.toObject(ut, it),
                  updateTime:
                    (it = xe.getUpdateTime()) && pt.Timestamp.toObject(ut, it),
                };
              return (ut && (lt.$jspbMessageInstance = xe), lt);
            })),
          (proto.alis.os.accounts.v1.Invite.deserializeBinary = function (ut) {
            var xe = new ee.BinaryReader(ut),
              it = new proto.alis.os.accounts.v1.Invite();
            return proto.alis.os.accounts.v1.Invite.deserializeBinaryFromReader(
              it,
              xe,
            );
          }),
          (proto.alis.os.accounts.v1.Invite.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = xe.readStringRequireUtf8();
                    ut.setName(lt);
                    break;
                  case 2:
                    var lt = xe.readEnum();
                    ut.setIdeateSeat(lt);
                    break;
                  case 3:
                    var lt = xe.readEnum();
                    ut.setBuildSeat(lt);
                    break;
                  case 4:
                    var lt = xe.readEnum();
                    ut.setManageSeat(lt);
                    break;
                  case 10:
                    var lt = xe.readBool();
                    ut.setAllowAll(lt);
                    break;
                  case 11:
                    var lt = xe.readStringRequireUtf8();
                    ut.addDomains(lt);
                    break;
                  case 12:
                    var lt = new proto.alis.os.accounts.v1.Invite.User();
                    (xe.readMessage(
                      lt,
                      proto.alis.os.accounts.v1.Invite.User
                        .deserializeBinaryFromReader,
                    ),
                      ut.addUsers(lt));
                    break;
                  case 6:
                    var lt = new pt.Timestamp();
                    (xe.readMessage(
                      lt,
                      pt.Timestamp.deserializeBinaryFromReader,
                    ),
                      ut.setExpiryTime(lt));
                    break;
                  case 7:
                    var lt = xe.readStringRequireUtf8();
                    ut.setDesignatedAccount(lt);
                    break;
                  case 8:
                    var lt = xe.readStringRequireUtf8();
                    ut.setIdea(lt);
                    break;
                  case 9:
                    var lt = xe.readStringRequireUtf8();
                    ut.setBuildPartner(lt);
                    break;
                  case 97:
                    var lt = xe.readStringRequireUtf8();
                    ut.setInviter(lt);
                    break;
                  case 98:
                    var lt = new pt.Timestamp();
                    (xe.readMessage(
                      lt,
                      pt.Timestamp.deserializeBinaryFromReader,
                    ),
                      ut.setCreateTime(lt));
                    break;
                  case 99:
                    var lt = new pt.Timestamp();
                    (xe.readMessage(
                      lt,
                      pt.Timestamp.deserializeBinaryFromReader,
                    ),
                      ut.setUpdateTime(lt));
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter = function (
            ut,
            xe,
          ) {
            var it = void 0;
            ((it = ut.getName()),
              it.length > 0 && xe.writeString(1, it),
              (it = ut.getIdeateSeat()),
              it !== 0 && xe.writeEnum(2, it),
              (it = ut.getBuildSeat()),
              it !== 0 && xe.writeEnum(3, it),
              (it = ut.getManageSeat()),
              it !== 0 && xe.writeEnum(4, it),
              (it = ut.getAllowAll()),
              it && xe.writeBool(10, it),
              (it = ut.getDomainsList()),
              it.length > 0 && xe.writeRepeatedString(11, it),
              (it = ut.getUsersList()),
              it.length > 0 &&
                xe.writeRepeatedMessage(
                  12,
                  it,
                  proto.alis.os.accounts.v1.Invite.User.serializeBinaryToWriter,
                ),
              (it = ut.getExpiryTime()),
              it != null &&
                xe.writeMessage(6, it, pt.Timestamp.serializeBinaryToWriter),
              (it = ut.getDesignatedAccount()),
              it.length > 0 && xe.writeString(7, it),
              (it = ut.getIdea()),
              it.length > 0 && xe.writeString(8, it),
              (it = ut.getBuildPartner()),
              it.length > 0 && xe.writeString(9, it),
              (it = ut.getInviter()),
              it.length > 0 && xe.writeString(97, it),
              (it = ut.getCreateTime()),
              it != null &&
                xe.writeMessage(98, it, pt.Timestamp.serializeBinaryToWriter),
              (it = ut.getUpdateTime()),
              it != null &&
                xe.writeMessage(99, it, pt.Timestamp.serializeBinaryToWriter));
          }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.Invite.User.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.Invite.User.toObject(ut, this);
              }),
            (proto.alis.os.accounts.v1.Invite.User.toObject = function (
              ut,
              xe,
            ) {
              var it,
                lt = {
                  user: ee.Message.getFieldWithDefault(xe, 1, ""),
                  email: ee.Message.getFieldWithDefault(xe, 2, ""),
                  displayName: ee.Message.getFieldWithDefault(xe, 3, ""),
                  profilePictureUri: ee.Message.getFieldWithDefault(xe, 4, ""),
                  domain: ee.Message.getFieldWithDefault(xe, 5, ""),
                  claimedTime:
                    (it = xe.getClaimedTime()) && pt.Timestamp.toObject(ut, it),
                  role: ee.Message.getFieldWithDefault(xe, 7, 0),
                };
              return (ut && (lt.$jspbMessageInstance = xe), lt);
            })),
          (proto.alis.os.accounts.v1.Invite.User.deserializeBinary = function (
            ut,
          ) {
            var xe = new ee.BinaryReader(ut),
              it = new proto.alis.os.accounts.v1.Invite.User();
            return proto.alis.os.accounts.v1.Invite.User.deserializeBinaryFromReader(
              it,
              xe,
            );
          }),
          (proto.alis.os.accounts.v1.Invite.User.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = xe.readStringRequireUtf8();
                    ut.setUser(lt);
                    break;
                  case 2:
                    var lt = xe.readStringRequireUtf8();
                    ut.setEmail(lt);
                    break;
                  case 3:
                    var lt = xe.readStringRequireUtf8();
                    ut.setDisplayName(lt);
                    break;
                  case 4:
                    var lt = xe.readStringRequireUtf8();
                    ut.setProfilePictureUri(lt);
                    break;
                  case 5:
                    var lt = xe.readStringRequireUtf8();
                    ut.setDomain(lt);
                    break;
                  case 6:
                    var lt = new pt.Timestamp();
                    (xe.readMessage(
                      lt,
                      pt.Timestamp.deserializeBinaryFromReader,
                    ),
                      ut.setClaimedTime(lt));
                    break;
                  case 7:
                    var lt = xe.readEnum();
                    ut.setRole(lt);
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.Invite.User.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.Invite.User.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getUser()),
                it.length > 0 && xe.writeString(1, it),
                (it = ut.getEmail()),
                it.length > 0 && xe.writeString(2, it),
                (it = ut.getDisplayName()),
                it.length > 0 && xe.writeString(3, it),
                (it = ut.getProfilePictureUri()),
                it.length > 0 && xe.writeString(4, it),
                (it = ut.getDomain()),
                it.length > 0 && xe.writeString(5, it),
                (it = ut.getClaimedTime()),
                it != null &&
                  xe.writeMessage(6, it, pt.Timestamp.serializeBinaryToWriter),
                (it = ut.getRole()),
                it !== 0 && xe.writeEnum(7, it));
            }),
          (proto.alis.os.accounts.v1.Invite.User.Role = {
            ROLE_UNSPECIFIED: 0,
            ADMIN: 1,
            VIEWER: 2,
          }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.getUser =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.setUser = function (
            ut,
          ) {
            return ee.Message.setProto3StringField(this, 1, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.getEmail =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.setEmail = function (
            ut,
          ) {
            return ee.Message.setProto3StringField(this, 2, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.getDisplayName =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.setDisplayName =
            function (ut) {
              return ee.Message.setProto3StringField(this, 3, ut);
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.getProfilePictureUri =
            function () {
              return ee.Message.getFieldWithDefault(this, 4, "");
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.setProfilePictureUri =
            function (ut) {
              return ee.Message.setProto3StringField(this, 4, ut);
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.getDomain =
            function () {
              return ee.Message.getFieldWithDefault(this, 5, "");
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.setDomain =
            function (ut) {
              return ee.Message.setProto3StringField(this, 5, ut);
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.getClaimedTime =
            function () {
              return ee.Message.getWrapperField(this, pt.Timestamp, 6);
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.setClaimedTime =
            function (ut) {
              return ee.Message.setWrapperField(this, 6, ut);
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.clearClaimedTime =
            function () {
              return this.setClaimedTime(void 0);
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.hasClaimedTime =
            function () {
              return ee.Message.getField(this, 6) != null;
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.getRole =
            function () {
              return ee.Message.getFieldWithDefault(this, 7, 0);
            }),
          (proto.alis.os.accounts.v1.Invite.User.prototype.setRole = function (
            ut,
          ) {
            return ee.Message.setProto3EnumField(this, 7, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getName = function () {
            return ee.Message.getFieldWithDefault(this, 1, "");
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.setName = function (ut) {
            return ee.Message.setProto3StringField(this, 1, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getIdeateSeat =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, 0);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setIdeateSeat = function (
            ut,
          ) {
            return ee.Message.setProto3EnumField(this, 2, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getBuildSeat =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, 0);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setBuildSeat = function (
            ut,
          ) {
            return ee.Message.setProto3EnumField(this, 3, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getManageSeat =
            function () {
              return ee.Message.getFieldWithDefault(this, 4, 0);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setManageSeat = function (
            ut,
          ) {
            return ee.Message.setProto3EnumField(this, 4, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getAllowAll =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 10, !1);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setAllowAll = function (
            ut,
          ) {
            return ee.Message.setProto3BooleanField(this, 10, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getDomainsList =
            function () {
              return ee.Message.getRepeatedField(this, 11);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setDomainsList =
            function (ut) {
              return ee.Message.setField(this, 11, ut || []);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.addDomains = function (
            ut,
            xe,
          ) {
            return ee.Message.addToRepeatedField(this, 11, ut, xe);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.clearDomainsList =
            function () {
              return this.setDomainsList([]);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.getUsersList =
            function () {
              return ee.Message.getRepeatedWrapperField(
                this,
                proto.alis.os.accounts.v1.Invite.User,
                12,
              );
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setUsersList = function (
            ut,
          ) {
            return ee.Message.setRepeatedWrapperField(this, 12, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.addUsers = function (
            ut,
            xe,
          ) {
            return ee.Message.addToRepeatedWrapperField(
              this,
              12,
              ut,
              proto.alis.os.accounts.v1.Invite.User,
              xe,
            );
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.clearUsersList =
            function () {
              return this.setUsersList([]);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.getExpiryTime =
            function () {
              return ee.Message.getWrapperField(this, pt.Timestamp, 6);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setExpiryTime = function (
            ut,
          ) {
            return ee.Message.setWrapperField(this, 6, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.clearExpiryTime =
            function () {
              return this.setExpiryTime(void 0);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.hasExpiryTime =
            function () {
              return ee.Message.getField(this, 6) != null;
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.getDesignatedAccount =
            function () {
              return ee.Message.getFieldWithDefault(this, 7, "");
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setDesignatedAccount =
            function (ut) {
              return ee.Message.setProto3StringField(this, 7, ut);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.getIdea = function () {
            return ee.Message.getFieldWithDefault(this, 8, "");
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.setIdea = function (ut) {
            return ee.Message.setProto3StringField(this, 8, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getBuildPartner =
            function () {
              return ee.Message.getFieldWithDefault(this, 9, "");
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setBuildPartner =
            function (ut) {
              return ee.Message.setProto3StringField(this, 9, ut);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.getInviter = function () {
            return ee.Message.getFieldWithDefault(this, 97, "");
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.setInviter = function (
            ut,
          ) {
            return ee.Message.setProto3StringField(this, 97, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.getCreateTime =
            function () {
              return ee.Message.getWrapperField(this, pt.Timestamp, 98);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setCreateTime = function (
            ut,
          ) {
            return ee.Message.setWrapperField(this, 98, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.clearCreateTime =
            function () {
              return this.setCreateTime(void 0);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.hasCreateTime =
            function () {
              return ee.Message.getField(this, 98) != null;
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.getUpdateTime =
            function () {
              return ee.Message.getWrapperField(this, pt.Timestamp, 99);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.setUpdateTime = function (
            ut,
          ) {
            return ee.Message.setWrapperField(this, 99, ut);
          }),
          (proto.alis.os.accounts.v1.Invite.prototype.clearUpdateTime =
            function () {
              return this.setUpdateTime(void 0);
            }),
          (proto.alis.os.accounts.v1.Invite.prototype.hasUpdateTime =
            function () {
              return ee.Message.getField(this, 99) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.GetInviteRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.GetInviteRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.GetInviteRequest.toObject = function (
              ut,
              xe,
            ) {
              var it,
                lt = {
                  name: ee.Message.getFieldWithDefault(xe, 1, ""),
                  readMask:
                    (it = xe.getReadMask()) && ht.FieldMask.toObject(ut, it),
                };
              return (ut && (lt.$jspbMessageInstance = xe), lt);
            })),
          (proto.alis.os.accounts.v1.GetInviteRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.GetInviteRequest();
              return proto.alis.os.accounts.v1.GetInviteRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = xe.readStringRequireUtf8();
                    ut.setName(lt);
                    break;
                  case 2:
                    var lt = new ht.FieldMask();
                    (xe.readMessage(
                      lt,
                      ht.FieldMask.deserializeBinaryFromReader,
                    ),
                      ut.setReadMask(lt));
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.GetInviteRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getName()),
                it.length > 0 && xe.writeString(1, it),
                (it = ut.getReadMask()),
                it != null &&
                  xe.writeMessage(2, it, ht.FieldMask.serializeBinaryToWriter));
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.prototype.getName =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.prototype.setName =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.prototype.getReadMask =
            function () {
              return ee.Message.getWrapperField(this, ht.FieldMask, 2);
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.prototype.setReadMask =
            function (ut) {
              return ee.Message.setWrapperField(this, 2, ut);
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.prototype.clearReadMask =
            function () {
              return this.setReadMask(void 0);
            }),
          (proto.alis.os.accounts.v1.GetInviteRequest.prototype.hasReadMask =
            function () {
              return ee.Message.getField(this, 2) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.CreateInviteRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.CreateInviteRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.CreateInviteRequest.toObject = function (
              ut,
              xe,
            ) {
              var it,
                lt = {
                  parent: ee.Message.getFieldWithDefault(xe, 1, ""),
                  invite:
                    (it = xe.getInvite()) &&
                    proto.alis.os.accounts.v1.Invite.toObject(ut, it),
                };
              return (ut && (lt.$jspbMessageInstance = xe), lt);
            })),
          (proto.alis.os.accounts.v1.CreateInviteRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.CreateInviteRequest();
              return proto.alis.os.accounts.v1.CreateInviteRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = xe.readStringRequireUtf8();
                    ut.setParent(lt);
                    break;
                  case 2:
                    var lt = new proto.alis.os.accounts.v1.Invite();
                    (xe.readMessage(
                      lt,
                      proto.alis.os.accounts.v1.Invite
                        .deserializeBinaryFromReader,
                    ),
                      ut.setInvite(lt));
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.CreateInviteRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getParent()),
                it.length > 0 && xe.writeString(1, it),
                (it = ut.getInvite()),
                it != null &&
                  xe.writeMessage(
                    2,
                    it,
                    proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter,
                  ));
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.prototype.getParent =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.prototype.setParent =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.prototype.getInvite =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.accounts.v1.Invite,
                2,
              );
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.prototype.setInvite =
            function (ut) {
              return ee.Message.setWrapperField(this, 2, ut);
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.prototype.clearInvite =
            function () {
              return this.setInvite(void 0);
            }),
          (proto.alis.os.accounts.v1.CreateInviteRequest.prototype.hasInvite =
            function () {
              return ee.Message.getField(this, 2) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.CreateInviteResponse.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.CreateInviteResponse.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.CreateInviteResponse.toObject =
              function (ut, xe) {
                var it,
                  lt = {
                    invite:
                      (it = xe.getInvite()) &&
                      proto.alis.os.accounts.v1.Invite.toObject(ut, it),
                  };
                return (ut && (lt.$jspbMessageInstance = xe), lt);
              })),
          (proto.alis.os.accounts.v1.CreateInviteResponse.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.CreateInviteResponse();
              return proto.alis.os.accounts.v1.CreateInviteResponse.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.CreateInviteResponse.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                if (it === 1) {
                  var lt = new proto.alis.os.accounts.v1.Invite();
                  (xe.readMessage(
                    lt,
                    proto.alis.os.accounts.v1.Invite
                      .deserializeBinaryFromReader,
                  ),
                    ut.setInvite(lt));
                } else xe.skipField();
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.CreateInviteResponse.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.CreateInviteResponse.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.CreateInviteResponse.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getInvite()),
                it != null &&
                  xe.writeMessage(
                    1,
                    it,
                    proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter,
                  ));
            }),
          (proto.alis.os.accounts.v1.CreateInviteResponse.prototype.getInvite =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.accounts.v1.Invite,
                1,
              );
            }),
          (proto.alis.os.accounts.v1.CreateInviteResponse.prototype.setInvite =
            function (ut) {
              return ee.Message.setWrapperField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.CreateInviteResponse.prototype.clearInvite =
            function () {
              return this.setInvite(void 0);
            }),
          (proto.alis.os.accounts.v1.CreateInviteResponse.prototype.hasInvite =
            function () {
              return ee.Message.getField(this, 1) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.UpdateInviteRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.UpdateInviteRequest.toObject = function (
              ut,
              xe,
            ) {
              var it,
                lt = {
                  invite:
                    (it = xe.getInvite()) &&
                    proto.alis.os.accounts.v1.Invite.toObject(ut, it),
                  updateMask:
                    (it = xe.getUpdateMask()) && ht.FieldMask.toObject(ut, it),
                };
              return (ut && (lt.$jspbMessageInstance = xe), lt);
            })),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.UpdateInviteRequest();
              return proto.alis.os.accounts.v1.UpdateInviteRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = new proto.alis.os.accounts.v1.Invite();
                    (xe.readMessage(
                      lt,
                      proto.alis.os.accounts.v1.Invite
                        .deserializeBinaryFromReader,
                    ),
                      ut.setInvite(lt));
                    break;
                  case 2:
                    var lt = new ht.FieldMask();
                    (xe.readMessage(
                      lt,
                      ht.FieldMask.deserializeBinaryFromReader,
                    ),
                      ut.setUpdateMask(lt));
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.UpdateInviteRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getInvite()),
                it != null &&
                  xe.writeMessage(
                    1,
                    it,
                    proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter,
                  ),
                (it = ut.getUpdateMask()),
                it != null &&
                  xe.writeMessage(2, it, ht.FieldMask.serializeBinaryToWriter));
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.getInvite =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.accounts.v1.Invite,
                1,
              );
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.setInvite =
            function (ut) {
              return ee.Message.setWrapperField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.clearInvite =
            function () {
              return this.setInvite(void 0);
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.hasInvite =
            function () {
              return ee.Message.getField(this, 1) != null;
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.getUpdateMask =
            function () {
              return ee.Message.getWrapperField(this, ht.FieldMask, 2);
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.setUpdateMask =
            function (ut) {
              return ee.Message.setWrapperField(this, 2, ut);
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.clearUpdateMask =
            function () {
              return this.setUpdateMask(void 0);
            }),
          (proto.alis.os.accounts.v1.UpdateInviteRequest.prototype.hasUpdateMask =
            function () {
              return ee.Message.getField(this, 2) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.DeleteInviteRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.DeleteInviteRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.DeleteInviteRequest.toObject = function (
              ut,
              xe,
            ) {
              var it = {
                name: ee.Message.getFieldWithDefault(xe, 1, ""),
              };
              return (ut && (it.$jspbMessageInstance = xe), it);
            })),
          (proto.alis.os.accounts.v1.DeleteInviteRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.DeleteInviteRequest();
              return proto.alis.os.accounts.v1.DeleteInviteRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.DeleteInviteRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                if (it === 1) {
                  var lt = xe.readStringRequireUtf8();
                  ut.setName(lt);
                } else xe.skipField();
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.DeleteInviteRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.DeleteInviteRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.DeleteInviteRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getName()), it.length > 0 && xe.writeString(1, it));
            }),
          (proto.alis.os.accounts.v1.DeleteInviteRequest.prototype.getName =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.DeleteInviteRequest.prototype.setName =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.ListInvitesRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.ListInvitesRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.ListInvitesRequest.toObject = function (
              ut,
              xe,
            ) {
              var it,
                lt = {
                  parent: ee.Message.getFieldWithDefault(xe, 1, ""),
                  pageSize: ee.Message.getFieldWithDefault(xe, 2, 0),
                  pageToken: ee.Message.getFieldWithDefault(xe, 3, ""),
                  readMask:
                    (it = xe.getReadMask()) && ht.FieldMask.toObject(ut, it),
                  filter: ee.Message.getFieldWithDefault(xe, 5, ""),
                };
              return (ut && (lt.$jspbMessageInstance = xe), lt);
            })),
          (proto.alis.os.accounts.v1.ListInvitesRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.ListInvitesRequest();
              return proto.alis.os.accounts.v1.ListInvitesRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = xe.readStringRequireUtf8();
                    ut.setParent(lt);
                    break;
                  case 2:
                    var lt = xe.readInt32();
                    ut.setPageSize(lt);
                    break;
                  case 3:
                    var lt = xe.readStringRequireUtf8();
                    ut.setPageToken(lt);
                    break;
                  case 4:
                    var lt = new ht.FieldMask();
                    (xe.readMessage(
                      lt,
                      ht.FieldMask.deserializeBinaryFromReader,
                    ),
                      ut.setReadMask(lt));
                    break;
                  case 5:
                    var lt = xe.readStringRequireUtf8();
                    ut.setFilter(lt);
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.ListInvitesRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getParent()),
                it.length > 0 && xe.writeString(1, it),
                (it = ut.getPageSize()),
                it !== 0 && xe.writeInt32(2, it),
                (it = ut.getPageToken()),
                it.length > 0 && xe.writeString(3, it),
                (it = ut.getReadMask()),
                it != null &&
                  xe.writeMessage(4, it, ht.FieldMask.serializeBinaryToWriter),
                (it = ut.getFilter()),
                it.length > 0 && xe.writeString(5, it));
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.getParent =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.setParent =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.getPageSize =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, 0);
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.setPageSize =
            function (ut) {
              return ee.Message.setProto3IntField(this, 2, ut);
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.getPageToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.setPageToken =
            function (ut) {
              return ee.Message.setProto3StringField(this, 3, ut);
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.getReadMask =
            function () {
              return ee.Message.getWrapperField(this, ht.FieldMask, 4);
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.setReadMask =
            function (ut) {
              return ee.Message.setWrapperField(this, 4, ut);
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.clearReadMask =
            function () {
              return this.setReadMask(void 0);
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.hasReadMask =
            function () {
              return ee.Message.getField(this, 4) != null;
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.getFilter =
            function () {
              return ee.Message.getFieldWithDefault(this, 5, "");
            }),
          (proto.alis.os.accounts.v1.ListInvitesRequest.prototype.setFilter =
            function (ut) {
              return ee.Message.setProto3StringField(this, 5, ut);
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.repeatedFields_ = [1]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.ListInvitesResponse.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.ListInvitesResponse.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.ListInvitesResponse.toObject = function (
              ut,
              xe,
            ) {
              var it = {
                invitesList: ee.Message.toObjectList(
                  xe.getInvitesList(),
                  proto.alis.os.accounts.v1.Invite.toObject,
                  ut,
                ),
                nextPageToken: ee.Message.getFieldWithDefault(xe, 2, ""),
              };
              return (ut && (it.$jspbMessageInstance = xe), it);
            })),
          (proto.alis.os.accounts.v1.ListInvitesResponse.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.ListInvitesResponse();
              return proto.alis.os.accounts.v1.ListInvitesResponse.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = new proto.alis.os.accounts.v1.Invite();
                    (xe.readMessage(
                      lt,
                      proto.alis.os.accounts.v1.Invite
                        .deserializeBinaryFromReader,
                    ),
                      ut.addInvites(lt));
                    break;
                  case 2:
                    var lt = xe.readStringRequireUtf8();
                    ut.setNextPageToken(lt);
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.ListInvitesResponse.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getInvitesList()),
                it.length > 0 &&
                  xe.writeRepeatedMessage(
                    1,
                    it,
                    proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter,
                  ),
                (it = ut.getNextPageToken()),
                it.length > 0 && xe.writeString(2, it));
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.prototype.getInvitesList =
            function () {
              return ee.Message.getRepeatedWrapperField(
                this,
                proto.alis.os.accounts.v1.Invite,
                1,
              );
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.prototype.setInvitesList =
            function (ut) {
              return ee.Message.setRepeatedWrapperField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.prototype.addInvites =
            function (ut, xe) {
              return ee.Message.addToRepeatedWrapperField(
                this,
                1,
                ut,
                proto.alis.os.accounts.v1.Invite,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.prototype.clearInvitesList =
            function () {
              return this.setInvitesList([]);
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.prototype.getNextPageToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.accounts.v1.ListInvitesResponse.prototype.setNextPageToken =
            function (ut) {
              return ee.Message.setProto3StringField(this, 2, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.GenerateInviteTokenRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.toObject =
              function (ut, xe) {
                var it,
                  lt = {
                    invite:
                      (it = xe.getInvite()) &&
                      proto.alis.os.accounts.v1.Invite.toObject(ut, it),
                    parent: ee.Message.getFieldWithDefault(xe, 2, ""),
                  };
                return (ut && (lt.$jspbMessageInstance = xe), lt);
              })),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.GenerateInviteTokenRequest();
              return proto.alis.os.accounts.v1.GenerateInviteTokenRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = new proto.alis.os.accounts.v1.Invite();
                    (xe.readMessage(
                      lt,
                      proto.alis.os.accounts.v1.Invite
                        .deserializeBinaryFromReader,
                    ),
                      ut.setInvite(lt));
                    break;
                  case 2:
                    var lt = xe.readStringRequireUtf8();
                    ut.setParent(lt);
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.GenerateInviteTokenRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getInvite()),
                it != null &&
                  xe.writeMessage(
                    1,
                    it,
                    proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter,
                  ),
                (it = ut.getParent()),
                it.length > 0 && xe.writeString(2, it));
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.getInvite =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.accounts.v1.Invite,
                1,
              );
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.setInvite =
            function (ut) {
              return ee.Message.setWrapperField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.clearInvite =
            function () {
              return this.setInvite(void 0);
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.hasInvite =
            function () {
              return ee.Message.getField(this, 1) != null;
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.getParent =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenRequest.prototype.setParent =
            function (ut) {
              return ee.Message.setProto3StringField(this, 2, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.GenerateInviteTokenResponse.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.GenerateInviteTokenResponse.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.toObject =
              function (ut, xe) {
                var it = {
                  token: ee.Message.getFieldWithDefault(xe, 1, ""),
                };
                return (ut && (it.$jspbMessageInstance = xe), it);
              })),
          (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it =
                  new proto.alis.os.accounts.v1.GenerateInviteTokenResponse();
              return proto.alis.os.accounts.v1.GenerateInviteTokenResponse.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                if (it === 1) {
                  var lt = xe.readStringRequireUtf8();
                  ut.setToken(lt);
                } else xe.skipField();
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.GenerateInviteTokenResponse.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getToken()), it.length > 0 && xe.writeString(1, it));
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.prototype.getToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.GenerateInviteTokenResponse.prototype.setToken =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.toObject =
              function (ut, xe) {
                var it = {
                  invite: ee.Message.getFieldWithDefault(xe, 1, ""),
                };
                return (ut && (it.$jspbMessageInstance = xe), it);
              })),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it =
                  new proto.alis.os.accounts.v1.RegenerateInviteTokenRequest();
              return proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                if (it === 1) {
                  var lt = xe.readStringRequireUtf8();
                  ut.setInvite(lt);
                } else xe.skipField();
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getInvite()), it.length > 0 && xe.writeString(1, it));
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.prototype.getInvite =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenRequest.prototype.setInvite =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.toObject =
              function (ut, xe) {
                var it = {
                  token: ee.Message.getFieldWithDefault(xe, 1, ""),
                };
                return (ut && (it.$jspbMessageInstance = xe), it);
              })),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it =
                  new proto.alis.os.accounts.v1.RegenerateInviteTokenResponse();
              return proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                if (it === 1) {
                  var lt = xe.readStringRequireUtf8();
                  ut.setToken(lt);
                } else xe.skipField();
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getToken()), it.length > 0 && xe.writeString(1, it));
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.prototype.getToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.RegenerateInviteTokenResponse.prototype.setToken =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.PreviewInviteRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.PreviewInviteRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.PreviewInviteRequest.toObject =
              function (ut, xe) {
                var it = {
                  token: ee.Message.getFieldWithDefault(xe, 1, ""),
                };
                return (ut && (it.$jspbMessageInstance = xe), it);
              })),
          (proto.alis.os.accounts.v1.PreviewInviteRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.PreviewInviteRequest();
              return proto.alis.os.accounts.v1.PreviewInviteRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                if (it === 1) {
                  var lt = xe.readStringRequireUtf8();
                  ut.setToken(lt);
                } else xe.skipField();
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.PreviewInviteRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.PreviewInviteRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getToken()), it.length > 0 && xe.writeString(1, it));
            }),
          (proto.alis.os.accounts.v1.PreviewInviteRequest.prototype.getToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.PreviewInviteRequest.prototype.setToken =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.PreviewInviteResponse.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.PreviewInviteResponse.toObject =
              function (ut, xe) {
                var it,
                  lt = {
                    invite:
                      (it = xe.getInvite()) &&
                      proto.alis.os.accounts.v1.Invite.toObject(ut, it),
                    buildPartner:
                      (it = xe.getBuildPartner()) &&
                      proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.toObject(
                        ut,
                        it,
                      ),
                  };
                return (ut && (lt.$jspbMessageInstance = xe), lt);
              })),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.PreviewInviteResponse();
              return proto.alis.os.accounts.v1.PreviewInviteResponse.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = new proto.alis.os.accounts.v1.Invite();
                    (xe.readMessage(
                      lt,
                      proto.alis.os.accounts.v1.Invite
                        .deserializeBinaryFromReader,
                    ),
                      ut.setInvite(lt));
                    break;
                  case 3:
                    var lt =
                      new proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner();
                    (xe.readMessage(
                      lt,
                      proto.alis.os.accounts.v1.PreviewInviteResponse
                        .BuildPartner.deserializeBinaryFromReader,
                    ),
                      ut.setBuildPartner(lt));
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.PreviewInviteResponse.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getInvite()),
                it != null &&
                  xe.writeMessage(
                    1,
                    it,
                    proto.alis.os.accounts.v1.Invite.serializeBinaryToWriter,
                  ),
                (it = ut.getBuildPartner()),
                it != null &&
                  xe.writeMessage(
                    3,
                    it,
                    proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner
                      .serializeBinaryToWriter,
                  ));
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.toObject =
              function (ut, xe) {
                var it = {
                  buildPartner: ee.Message.getFieldWithDefault(xe, 1, ""),
                  displayName: ee.Message.getFieldWithDefault(xe, 2, ""),
                  websiteUri: ee.Message.getFieldWithDefault(xe, 3, ""),
                  logoUri: ee.Message.getFieldWithDefault(xe, 4, ""),
                };
                return (ut && (it.$jspbMessageInstance = xe), it);
              })),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it =
                  new proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner();
              return proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = xe.readStringRequireUtf8();
                    ut.setBuildPartner(lt);
                    break;
                  case 2:
                    var lt = xe.readStringRequireUtf8();
                    ut.setDisplayName(lt);
                    break;
                  case 3:
                    var lt = xe.readStringRequireUtf8();
                    ut.setWebsiteUri(lt);
                    break;
                  case 4:
                    var lt = xe.readStringRequireUtf8();
                    ut.setLogoUri(lt);
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getBuildPartner()),
                it.length > 0 && xe.writeString(1, it),
                (it = ut.getDisplayName()),
                it.length > 0 && xe.writeString(2, it),
                (it = ut.getWebsiteUri()),
                it.length > 0 && xe.writeString(3, it),
                (it = ut.getLogoUri()),
                it.length > 0 && xe.writeString(4, it));
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.getBuildPartner =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.setBuildPartner =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.getDisplayName =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.setDisplayName =
            function (ut) {
              return ee.Message.setProto3StringField(this, 2, ut);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.getWebsiteUri =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.setWebsiteUri =
            function (ut) {
              return ee.Message.setProto3StringField(this, 3, ut);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.getLogoUri =
            function () {
              return ee.Message.getFieldWithDefault(this, 4, "");
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner.prototype.setLogoUri =
            function (ut) {
              return ee.Message.setProto3StringField(this, 4, ut);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.getInvite =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.accounts.v1.Invite,
                1,
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.setInvite =
            function (ut) {
              return ee.Message.setWrapperField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.clearInvite =
            function () {
              return this.setInvite(void 0);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.hasInvite =
            function () {
              return ee.Message.getField(this, 1) != null;
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.getBuildPartner =
            function () {
              return ee.Message.getWrapperField(
                this,
                proto.alis.os.accounts.v1.PreviewInviteResponse.BuildPartner,
                3,
              );
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.setBuildPartner =
            function (ut) {
              return ee.Message.setWrapperField(this, 3, ut);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.clearBuildPartner =
            function () {
              return this.setBuildPartner(void 0);
            }),
          (proto.alis.os.accounts.v1.PreviewInviteResponse.prototype.hasBuildPartner =
            function () {
              return ee.Message.getField(this, 3) != null;
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.AcceptInviteRequest.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.AcceptInviteRequest.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.AcceptInviteRequest.toObject = function (
              ut,
              xe,
            ) {
              var it = {
                token: ee.Message.getFieldWithDefault(xe, 1, ""),
              };
              return (ut && (it.$jspbMessageInstance = xe), it);
            })),
          (proto.alis.os.accounts.v1.AcceptInviteRequest.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.AcceptInviteRequest();
              return proto.alis.os.accounts.v1.AcceptInviteRequest.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.AcceptInviteRequest.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                if (it === 1) {
                  var lt = xe.readStringRequireUtf8();
                  ut.setToken(lt);
                } else xe.skipField();
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.AcceptInviteRequest.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.AcceptInviteRequest.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.AcceptInviteRequest.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getToken()), it.length > 0 && xe.writeString(1, it));
            }),
          (proto.alis.os.accounts.v1.AcceptInviteRequest.prototype.getToken =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.AcceptInviteRequest.prototype.setToken =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.toObject =
              function (ut) {
                return proto.alis.os.accounts.v1.AcceptInviteResponse.toObject(
                  ut,
                  this,
                );
              }),
            (proto.alis.os.accounts.v1.AcceptInviteResponse.toObject =
              function (ut, xe) {
                var it = {
                  account: ee.Message.getFieldWithDefault(xe, 1, ""),
                  ideateSeat: ee.Message.getFieldWithDefault(xe, 2, ""),
                  buildSeat: ee.Message.getFieldWithDefault(xe, 3, ""),
                  manageSeat: ee.Message.getFieldWithDefault(xe, 4, ""),
                };
                return (ut && (it.$jspbMessageInstance = xe), it);
              })),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.deserializeBinary =
            function (ut) {
              var xe = new ee.BinaryReader(ut),
                it = new proto.alis.os.accounts.v1.AcceptInviteResponse();
              return proto.alis.os.accounts.v1.AcceptInviteResponse.deserializeBinaryFromReader(
                it,
                xe,
              );
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.deserializeBinaryFromReader =
            function (ut, xe) {
              for (; xe.nextField() && !xe.isEndGroup(); ) {
                var it = xe.getFieldNumber();
                switch (it) {
                  case 1:
                    var lt = xe.readStringRequireUtf8();
                    ut.setAccount(lt);
                    break;
                  case 2:
                    var lt = xe.readStringRequireUtf8();
                    ut.setIdeateSeat(lt);
                    break;
                  case 3:
                    var lt = xe.readStringRequireUtf8();
                    ut.setBuildSeat(lt);
                    break;
                  case 4:
                    var lt = xe.readStringRequireUtf8();
                    ut.setManageSeat(lt);
                    break;
                  default:
                    xe.skipField();
                    break;
                }
              }
              return ut;
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.serializeBinary =
            function () {
              var ut = new ee.BinaryWriter();
              return (
                proto.alis.os.accounts.v1.AcceptInviteResponse.serializeBinaryToWriter(
                  this,
                  ut,
                ),
                ut.getResultBuffer()
              );
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.serializeBinaryToWriter =
            function (ut, xe) {
              var it = void 0;
              ((it = ut.getAccount()),
                it.length > 0 && xe.writeString(1, it),
                (it = ut.getIdeateSeat()),
                it.length > 0 && xe.writeString(2, it),
                (it = ut.getBuildSeat()),
                it.length > 0 && xe.writeString(3, it),
                (it = ut.getManageSeat()),
                it.length > 0 && xe.writeString(4, it));
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.getAccount =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.setAccount =
            function (ut) {
              return ee.Message.setProto3StringField(this, 1, ut);
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.getIdeateSeat =
            function () {
              return ee.Message.getFieldWithDefault(this, 2, "");
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.setIdeateSeat =
            function (ut) {
              return ee.Message.setProto3StringField(this, 2, ut);
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.getBuildSeat =
            function () {
              return ee.Message.getFieldWithDefault(this, 3, "");
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.setBuildSeat =
            function (ut) {
              return ee.Message.setProto3StringField(this, 3, ut);
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.getManageSeat =
            function () {
              return ee.Message.getFieldWithDefault(this, 4, "");
            }),
          (proto.alis.os.accounts.v1.AcceptInviteResponse.prototype.setManageSeat =
            function (ut) {
              return ee.Message.setProto3StringField(this, 4, ut);
            }),
          te.object.extend(ne, proto.alis.os.accounts.v1));
      })(invite_pb)),
    invite_pb
  );
}
