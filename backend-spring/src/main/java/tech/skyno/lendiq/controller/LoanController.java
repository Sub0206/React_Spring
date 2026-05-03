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
 * SAMPLE: list loans for the authenticated lender. Scopes by {@code funded_by}
 * to match the existing Python logic exactly.
 */
@RestController
@RequestMapping("/api/v1/loans")
public class LoanController {

    private final MongoTemplate mongo;

    public LoanController(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @GetMapping
    public ResponseEntity<?> list(HttpServletRequest req) {
        String uid = (String) req.getAttribute("userId");
        if (uid == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("detail", "Unauthorized"));
        List<Document> docs = mongo.find(
                Query.query(Criteria.where("funded_by").is(uid)),
                Document.class, "loans");
        docs.forEach(d -> d.remove("_id"));
        return ResponseEntity.ok(docs);
    }
}
