const { AISegmentationEngine } = require('../ai-segmentation');
const engine = new AISegmentationEngine();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, concepts } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image required (base64 string)' });
    }

    const result = await engine.analyze(image, { concepts });
    res.status(200).json(result);

  } catch (error) {
    console.error('[API /ai-segment/analyze] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
