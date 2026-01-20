Based on the Penpot Plugin API and internal file definitions, here is a comprehensive **Property Schema** you can use to instruct your AI. This schema unifies visual properties, layout rules, and design tokens into a structured JSON format that the AI can read (via "Inspector") and write (via "Builder").

### 1\. The Core Schema (JSON Structure)

Use this structure to define any element in the Penpot ecosystem.  
{  
  "id": "UUID (read-only)",  
  "name": "String (Layer Name)",  
  "type": "board" | "text" | "path" | "image" | "group" | "component",  
  "visible": true,  
  "locked": false,  
    
  // POSITION & DIMENSIONS  
  "geometry": {  
    "x": 0, "y": 0,  
    "width": 320, "height": 100,  
    "rotation": 0, // Degrees  
    "constraints": {  
      "horizontal": "min" | "max" | "center" | "scale" | "stretch",  
      "vertical": "min" | "max" | "center" | "scale" | "stretch"  
    }  
  },

  // VISUAL STYLING  
  "styling": {  
    "opacity": 1.0,  
    "blendMode": "normal" | "multiply" | "screen" | "overlay",  
    "fills": \[  
      {  
        "type": "solid",  
        "color": "\#FFFFFF", // Or Token ID: "{color.surface.primary}"  
        "opacity": 1.0  
      },  
      {  
        "type": "image",  
        "opacity": 1.0,  
        "image": "ImageID"  
      }  
    \],  
    "strokes": \[  
      {  
        "color": "\#000000",  
        "width": 1,  
        "style": "solid" | "dashed" | "dotted",  
        "alignment": "center" | "inner" | "outer"  
      }  
    \],  
    "effects": {  
      "shadows": \[  
        { "color": "\#000000", "x": 0, "y": 4, "blur": 10, "spread": 0, "inset": false }  
      \],  
      "blurs": \[  
        { "type": "layer" | "background", "radius": 10 }  
      \]  
    },  
    "borderRadius": { // Can be a single number or individual corners  
      "topLeft": 8, "topRight": 8, "bottomRight": 8, "bottomLeft": 8  
    }  
  },

  // AUTO LAYOUT (FLEXBOX)  
  // Use strictly for container Boards/Frames  
  "layout\_flex": {  
    "type": "flex",  
    "direction": "row" | "column",  
    "wrap": "nowrap" | "wrap",  
    "gap": { "row": 16, "column": 16 },  
    "padding": { "top": 24, "right": 24, "bottom": 24, "left": 24 },  
    "alignItems": "start" | "center" | "end" | "stretch",  
    "justifyContent": "start" | "center" | "end" | "space-between",  
      
    // Child-specific sizing rules (applied to children of this container)  
    "childResizing": {  
      "width": "fixed" | "auto" | "fill", // 'auto' \= hug contents, 'fill' \= stretch  
      "height": "fixed" | "auto" | "fill"  
    }  
  },

  // GRID LAYOUT  
  "layout\_grid": {  
    "type": "grid",  
    "columns": \["1fr", "200px", "1fr"\], // Array defining column tracks  
    "rows": \["auto", "1fr"\],  
    "gap": { "row": 10, "column": 10 }  
  },

  // TYPOGRAPHY (Text Layers Only)  
  "typography": {  
    "text": "String Content",  
    "fontFamily": "Inter", // Or Token ID  
    "fontWeight": "400" | "700" | "bold",  
    "fontSize": "16",  
    "lineHeight": "1.5" | "24px",  
    "letterSpacing": "0",  
    "textTransform": "none" | "uppercase" | "lowercase" | "capitalize",  
    "textDecoration": "none" | "underline" | "line-through",  
    "align": "left" | "center" | "right" | "justify",  
    "verticalAlign": "top" | "center" | "bottom"  
  },

  "children": \[\] // Recursive array of layers  
}

### 2\. Key Property Definitions for the AI

When feeding this schema to your agent, provide these specific definitions to avoid "hallucinations":

#### A. Layout Engines 1, 2

* **Flex (Auto Layout):** This is the primary engine for UI design (cards, buttons, lists).  
* **Rule:** If layout\_flex is present, geometry.x and geometry.y of children are ignored by the renderer.  
* **Gap vs Padding:** Gap is the space *between* items; Padding is the space *inside* the container borders.  
* **Grid:** Use only for complex 2D layouts (like dashboards).  
* **None (Absolute):** If layout\_flex and layout\_grid are null, the layer uses absolute X/Y positioning.

#### B. Sizing Constraints (The "Resizing" Logic) 3, 4

The AI must understand how elements resize.

* **Fixed:** Explicit pixel value (e.g., width: 200).  
* **Hug (Fit Content):** The container shrinks to fit its children. (Mapped to width: "auto").  
* **Fill (Stretch):** The element expands to fill the parent's available space. (Mapped to width: "100%" or grow: 1).

#### C. Design Token Mapping 5, 6

To solve "hallucinated" styles (e.g., using random hex codes), force the AI to map raw values to these Token Types:

* **Color Tokens:** Use for fills, strokes, and typography.color.  
* **Typography Tokens:** Encapsulates fontFamily, fontSize, fontWeight into a single composite token.  
* **Spacing Tokens:** Use for gap and padding.  
* **Radius Tokens:** Use for borderRadius.

### 3\. Agent Implementation Snippets

**For the Inspector Agent (Reading):**Use get\_shape\_properties or get\_object\_tree to populate the schema.  
// Example Output from Inspector  
{  
  "type": "text",  
  "typography": {  
    "fontFamily": "Roboto",  
    "fontSize": "16"  
  },  
  "styling": {  
    "fills": \[{"color": "\#FF0000"}\]  
  }  
}  
**For the Architect Agent (Mapping):**Instruct it to check the penpot://tokens resource and transform the JSON.  
// Example Transformation  
{  
  "type": "text",  
  "typography": {  
    "fontFamily": "{token.font.body}", // Mapped from Roboto  
    "fontSize": "{token.size.md}"      // Mapped from 16  
  },  
  "styling": {  
    "fills": \[{"color": "{token.color.danger}"}\] // Mapped from \#FF0000  
  }  
}  
**For the Builder Agent (Writing):**Use update\_shape with the specific property paths.  
\# Pseudo-code for Builder Tool  
penpot.update\_shape(shape\_id, {  
    "fills": \[{"fillColor": "{token.color.danger}"}\],  
    "textDecoration": "underline"  
})  
