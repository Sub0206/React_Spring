package tech.skyno.lendiq.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tech.skyno.lendiq.auth.OtpService;

import java.util.Map;

/**
 * Authentication endpoints — OTP-only.
 *
 * Mirrors the FastAPI endpoints so frontends can switch hosts via one env var:
 *   POST /api/v1/auth/send-otp
 *   POST /api/v1/auth/verify-otp
 *   GET  /api/v1/auth/me (Bearer token)
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final OtpService otp;
    private final MongoTemplate mongo;

    public AuthController(OtpService otp, MongoTemplate mongo) {
        this.otp = otp;
        this.mongo = mongo;
    }

    public record SendOtpRequest(
            @NotBlank @Pattern(regexp = "^[0-9+\\s-]{10,15}$") String mobile,
            String purpose,
            String name
    ) {}

    public record VerifyOtpRequest(
            @NotBlank String mobile,
            @NotBlank @Pattern(regexp = "^[0-9]{4,6}$") String otp
    ) {}

    @PostMapping("/send-otp")
    public ResponseEntity<?> sendOtp(@Valid @RequestBody SendOtpRequest body) {
        try {
            String purpose = body.purpose() == null ? "login" : body.purpose();
            return ResponseEntity.ok(otp.sendOtp(body.mobile(), purpose, body.name()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("detail", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
        }
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@Valid @RequestBody VerifyOtpRequest body) {
        try {
            return ResponseEntity.ok(otp.verifyOtp(body.mobile(), body.otp()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("detail", e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest req) {
        String uid = (String) req.getAttribute("userId");
        if (uid == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("detail", "Unauthorized"));
        Document user = mongo.findOne(
                Query.query(Criteria.where("user_id").is(uid)),
                Document.class, "users");
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("detail", "Unauthorized"));
        user.remove("_id"); user.remove("password_hash"); user.remove("passcode_hash"); user.remove("mobile_verified");
        return ResponseEntity.ok(user);
    }
}
