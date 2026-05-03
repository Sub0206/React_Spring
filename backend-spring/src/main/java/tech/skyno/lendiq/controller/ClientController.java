package tech.skyno.lendiq.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * SAMPLE: list clients for the authenticated lender. Reads from the
 * {@code clients} collection already populated by the FastAPI seeder, so the
 * data contract matches the mobile + web apps today.
 *
 * <p>For parity with /api/v1/clients on the Python side we also strip
 * the internal {@code _id} before responding. Risk enrichment is deferred to
 * a later iteration — this is a skeleton, not a full port.</p>
 */
@RestController
@RequestMapping("/api/v1/clients")
public class ClientController {

    private final MongoTemplate mongo;

    public ClientController(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @GetMapping
    public ResponseEntity<?> list(HttpServletRequest req) {
        String uid = (String) req.getAttribute("userId");
        if (uid == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("detail", "Unauthorized"));
        List<Document> docs = mongo.find(
                Query.query(Criteria.where("lender_id").is(uid)),
                Document.class, "clients");
        docs.forEach(d -> d.remove("_id"));
        return ResponseEntity.ok(docs);
    }
}
